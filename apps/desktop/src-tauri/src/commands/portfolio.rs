//! User-owned NEPSE purchases and sales, stored only on this device.

use chrono::NaiveDate;
use rusqlite::{OptionalExtension, params};
use sajilo_core::portfolio::{
    self, StockAcquisitionSource, StockPortfolio, StockPrice, StockTradeEstimate, StockTransaction,
    StockTransactionKind,
};
use tauri::{AppHandle, Wry};

use crate::db;

type Result<T> = std::result::Result<T, String>;

fn kind_text(kind: StockTransactionKind) -> &'static str {
    match kind {
        StockTransactionKind::Purchase => "purchase",
        StockTransactionKind::Sale => "sale",
    }
}

fn parse_kind(value: &str) -> Result<StockTransactionKind> {
    match value {
        "purchase" => Ok(StockTransactionKind::Purchase),
        "sale" => Ok(StockTransactionKind::Sale),
        _ => Err(format!("Unknown stock transaction kind: {value}")),
    }
}

fn source_text(source: StockAcquisitionSource) -> &'static str {
    match source {
        StockAcquisitionSource::Secondary => "secondary",
        StockAcquisitionSource::IpoFpo => "ipoFpo",
        StockAcquisitionSource::Rights => "rights",
        StockAcquisitionSource::Bonus => "bonus",
        StockAcquisitionSource::Transfer => "transfer",
        StockAcquisitionSource::Other => "other",
    }
}

fn parse_source(value: Option<String>) -> Result<Option<StockAcquisitionSource>> {
    value
        .map(|value| match value.as_str() {
            "secondary" => Ok(StockAcquisitionSource::Secondary),
            "ipoFpo" => Ok(StockAcquisitionSource::IpoFpo),
            "rights" => Ok(StockAcquisitionSource::Rights),
            "bonus" => Ok(StockAcquisitionSource::Bonus),
            "transfer" => Ok(StockAcquisitionSource::Transfer),
            "other" => Ok(StockAcquisitionSource::Other),
            _ => Err(format!("Unknown purchase source: {value}")),
        })
        .transpose()
}

fn paisa(value: f64) -> Result<i64> {
    if !value.is_finite() || !(0.0..=90_000_000_000_000.0).contains(&value) {
        return Err("That amount is outside the supported range.".to_owned());
    }
    Ok((value * 100.0).round() as i64)
}

fn rupees(value: i64) -> f64 {
    value as f64 / 100.0
}

fn transactions(app: &AppHandle<Wry>) -> Result<Vec<StockTransaction>> {
    let connection = db::open(app)?;
    let mut statement = connection
        .prepare(
            "SELECT id, symbol, kind, trade_date, quantity, price_paisa,
                    fees_paisa, tax_paisa, fees_estimated, tax_estimated,
                    source, note
             FROM stock_transactions
             ORDER BY trade_date, created_at, id",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, i64>(4)?,
                row.get::<_, i64>(5)?,
                row.get::<_, i64>(6)?,
                row.get::<_, i64>(7)?,
                row.get::<_, bool>(8)?,
                row.get::<_, bool>(9)?,
                row.get::<_, Option<String>>(10)?,
                row.get::<_, String>(11)?,
            ))
        })
        .map_err(|error| error.to_string())?;
    rows.map(|row| {
        let (
            id,
            symbol,
            kind,
            trade_date,
            quantity,
            price,
            fees,
            tax,
            fees_estimated,
            tax_estimated,
            source,
            note,
        ) = row.map_err(|error| error.to_string())?;
        Ok(StockTransaction {
            id,
            symbol,
            kind: parse_kind(&kind)?,
            trade_date,
            quantity: u32::try_from(quantity).map_err(|_| "Invalid saved quantity.".to_owned())?,
            price: rupees(price),
            fees: rupees(fees),
            tax: rupees(tax),
            fees_estimated,
            tax_estimated,
            source: parse_source(source)?,
            note,
        })
    })
    .collect()
}

fn clean_symbol(symbol: String) -> Result<String> {
    let symbol = symbol.trim().to_uppercase();
    if symbol.is_empty()
        || symbol.len() > 20
        || !symbol
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || character == '-')
    {
        return Err("That is not a valid NEPSE symbol.".to_owned());
    }
    Ok(symbol)
}

#[tauri::command]
pub fn stock_portfolio(app: AppHandle<Wry>, prices: Vec<StockPrice>) -> Result<StockPortfolio> {
    Ok(portfolio::snapshot(&transactions(&app)?, &prices))
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn estimate_stock_trade(
    app: AppHandle<Wry>,
    id: Option<String>,
    symbol: String,
    kind: StockTransactionKind,
    source: Option<StockAcquisitionSource>,
    trade_date: String,
    quantity: u32,
    price: f64,
    fees: Option<f64>,
) -> Result<StockTradeEstimate> {
    let symbol = clean_symbol(symbol)?;
    let day = NaiveDate::parse_from_str(&trade_date, "%Y-%m-%d")
        .map_err(|_| "Choose a valid transaction date.".to_owned())?;
    let mut all = transactions(&app)?;
    if let Some(id) = id {
        all.retain(|transaction| transaction.id != id);
    }
    portfolio::estimate_trade(&all, &symbol, kind, source, day, quantity, price, fees)
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn save_stock_transaction(
    app: AppHandle<Wry>,
    id: String,
    symbol: String,
    kind: StockTransactionKind,
    source: Option<StockAcquisitionSource>,
    trade_date: String,
    quantity: u32,
    price: f64,
    fees: Option<f64>,
    note: String,
    prices: Vec<StockPrice>,
) -> Result<StockPortfolio> {
    let symbol = clean_symbol(symbol)?;
    if id.trim().is_empty() || id.len() > 80 {
        return Err("That transaction id is invalid.".to_owned());
    }
    let day = NaiveDate::parse_from_str(&trade_date, "%Y-%m-%d")
        .map_err(|_| "Choose a valid transaction date.".to_owned())?;
    if day > sajilo_core::nepal_time::today() {
        return Err("A transaction cannot be in the future.".to_owned());
    }
    let source = match kind {
        StockTransactionKind::Purchase => Some(source.unwrap_or(StockAcquisitionSource::Secondary)),
        StockTransactionKind::Sale => None,
    };
    let price = if source == Some(StockAcquisitionSource::Bonus) {
        0.0
    } else {
        price
    };
    let mut all = transactions(&app)?;
    all.retain(|transaction| transaction.id != id);
    let estimate =
        portfolio::estimate_trade(&all, &symbol, kind, source, day, quantity, price, fees)?;
    let transaction = StockTransaction {
        id: id.clone(),
        symbol: symbol.clone(),
        kind,
        trade_date: trade_date.clone(),
        quantity,
        price,
        fees: estimate.charges.total,
        tax: estimate.tax,
        fees_estimated: fees.is_none(),
        tax_estimated: kind == StockTransactionKind::Sale,
        source,
        note: note.trim().chars().take(500).collect(),
    };
    all.push(transaction.clone());
    portfolio::validate_transactions(&all)?;

    let connection = db::open(&app)?;
    let created_at: Option<String> = connection
        .query_row(
            "SELECT created_at FROM stock_transactions WHERE id = ?1",
            [&id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| error.to_string())?;
    let created_at = created_at.unwrap_or_else(|| chrono::Utc::now().to_rfc3339());
    connection
        .execute(
            "INSERT INTO stock_transactions (
                id, symbol, kind, trade_date, quantity, price_paisa, fees_paisa,
                tax_paisa, fees_estimated, tax_estimated, source, note, created_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
             ON CONFLICT(id) DO UPDATE SET
                symbol = excluded.symbol, kind = excluded.kind,
                trade_date = excluded.trade_date, quantity = excluded.quantity,
                price_paisa = excluded.price_paisa, fees_paisa = excluded.fees_paisa,
                tax_paisa = excluded.tax_paisa, fees_estimated = excluded.fees_estimated,
                tax_estimated = excluded.tax_estimated, source = excluded.source,
                note = excluded.note",
            params![
                id,
                symbol,
                kind_text(kind),
                trade_date,
                i64::from(quantity),
                paisa(price)?,
                paisa(transaction.fees)?,
                paisa(transaction.tax)?,
                transaction.fees_estimated,
                transaction.tax_estimated,
                source.map(source_text),
                transaction.note,
                created_at,
            ],
        )
        .map_err(|error| error.to_string())?;
    Ok(portfolio::snapshot(&all, &prices))
}

#[tauri::command]
pub fn delete_stock_transaction(
    app: AppHandle<Wry>,
    id: String,
    prices: Vec<StockPrice>,
) -> Result<StockPortfolio> {
    let mut all = transactions(&app)?;
    let original = all.len();
    all.retain(|transaction| transaction.id != id);
    if all.len() == original {
        return Ok(portfolio::snapshot(&all, &prices));
    }
    portfolio::validate_transactions(&all).map_err(|_| {
        "Delete the later sale first because it depends on this purchase.".to_owned()
    })?;
    db::open(&app)?
        .execute("DELETE FROM stock_transactions WHERE id = ?1", [&id])
        .map_err(|error| error.to_string())?;
    Ok(portfolio::snapshot(&all, &prices))
}
