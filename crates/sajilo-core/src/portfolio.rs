//! Offline NEPSE portfolio arithmetic.
//!
//! Transactions are the source of truth. Quotes are optional inputs, so a
//! holding, its WACC and its realised result remain useful with no network.
//! Fees and tax are estimates until a broker contract note replaces them.

use std::collections::{BTreeMap, VecDeque};

use chrono::NaiveDate;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "typescript",
    derive(ts_rs::TS),
    ts(export, export_to = "api/")
)]
pub enum StockTransactionKind {
    Purchase,
    Sale,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "typescript",
    derive(ts_rs::TS),
    ts(export, export_to = "api/")
)]
pub enum StockAcquisitionSource {
    Secondary,
    IpoFpo,
    Rights,
    Bonus,
    Transfer,
    Other,
}

/// One user-owned record. Rupee values cross the wire as decimals; the desktop
/// database stores them as integer paisa.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "typescript",
    derive(ts_rs::TS),
    ts(export, export_to = "api/")
)]
pub struct StockTransaction {
    pub id: String,
    pub symbol: String,
    pub kind: StockTransactionKind,
    /// Gregorian ISO date. The UI also presents its Bikram Sambat equivalent.
    pub trade_date: String,
    pub quantity: u32,
    pub price: f64,
    pub fees: f64,
    pub tax: f64,
    pub fees_estimated: bool,
    pub tax_estimated: bool,
    pub source: Option<StockAcquisitionSource>,
    pub note: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "typescript",
    derive(ts_rs::TS),
    ts(export, export_to = "api/")
)]
pub struct StockTradeCharges {
    pub broker: f64,
    pub sebon: f64,
    pub dp: f64,
    pub total: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "typescript",
    derive(ts_rs::TS),
    ts(export, export_to = "api/")
)]
pub struct StockTradeEstimate {
    pub gross: f64,
    pub charges: StockTradeCharges,
    pub tax: f64,
    /// Purchase: amount paid. Sale: amount receivable after fees and tax.
    pub net: f64,
    pub realised_profit_loss: Option<f64>,
    pub remaining_quantity: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "typescript",
    derive(ts_rs::TS),
    ts(export, export_to = "api/")
)]
pub struct StockPrice {
    pub symbol: String,
    pub price: f64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "typescript",
    derive(ts_rs::TS),
    ts(export, export_to = "api/")
)]
pub struct StockPosition {
    pub symbol: String,
    pub quantity: u32,
    pub average_cost: f64,
    pub invested: f64,
    pub market_price: Option<f64>,
    pub market_value: Option<f64>,
    pub unrealised_profit_loss: Option<f64>,
    pub unrealised_percent: Option<f64>,
    pub realised_profit_loss: f64,
    pub transactions: Vec<StockTransaction>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    feature = "typescript",
    derive(ts_rs::TS),
    ts(export, export_to = "api/")
)]
pub struct StockPortfolio {
    pub invested: f64,
    pub market_value: Option<f64>,
    pub unrealised_profit_loss: Option<f64>,
    pub realised_profit_loss: f64,
    pub positions: Vec<StockPosition>,
}

#[derive(Debug, Clone)]
struct Lot {
    date: NaiveDate,
    quantity: u32,
}

#[derive(Default)]
struct PositionState {
    quantity: u32,
    cost: f64,
    realised: f64,
    lots: VecDeque<Lot>,
    transactions: Vec<StockTransaction>,
}

fn date(value: &str) -> Option<NaiveDate> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d").ok()
}

fn round_money(value: f64) -> f64 {
    (value * 100.0).round() / 100.0
}

/// Current and previous broker schedules are date-versioned. The estimate is
/// deliberately replaceable with the contract-note amount in the UI.
pub fn estimated_charges(
    kind: StockTransactionKind,
    source: Option<StockAcquisitionSource>,
    trade_date: NaiveDate,
    gross: f64,
) -> StockTradeCharges {
    let market_trade = kind == StockTransactionKind::Sale
        || matches!(source, Some(StockAcquisitionSource::Secondary));
    if !market_trade || gross <= 0.0 {
        return StockTradeCharges {
            broker: 0.0,
            sebon: 0.0,
            dp: 0.0,
            total: 0.0,
        };
    }

    let revised = trade_date >= NaiveDate::from_ymd_opt(2024, 5, 14).unwrap();
    let rate = if revised {
        match gross {
            value if value <= 50_000.0 => 0.0036,
            value if value <= 500_000.0 => 0.0033,
            value if value <= 2_000_000.0 => 0.00306,
            value if value <= 10_000_000.0 => 0.0027,
            _ => 0.00243,
        }
    } else {
        match gross {
            value if value <= 50_000.0 => 0.0040,
            value if value <= 500_000.0 => 0.0037,
            value if value <= 2_000_000.0 => 0.0034,
            value if value <= 10_000_000.0 => 0.0030,
            _ => 0.0027,
        }
    };
    let broker = (gross * rate).max(if revised { 10.0 } else { 20.0 });
    let sebon = gross * 0.00015;
    // Per-scrip settlement-day estimate. Contract-note totals can replace it.
    let dp = 25.0;
    StockTradeCharges {
        broker: round_money(broker),
        sebon: round_money(sebon),
        dp,
        total: round_money(broker + sebon + dp),
    }
}

fn tax_rates(sale_date: NaiveDate) -> (f64, f64) {
    if sale_date >= NaiveDate::from_ymd_opt(2026, 7, 17).unwrap() {
        (0.075, 0.10)
    } else if sale_date >= NaiveDate::from_ymd_opt(2021, 7, 16).unwrap() {
        (0.05, 0.075)
    } else {
        (0.05, 0.05)
    }
}

fn consume_lots(lots: &mut VecDeque<Lot>, quantity: u32) -> Vec<Lot> {
    let mut left = quantity;
    let mut consumed = Vec::new();
    while left > 0 {
        let Some(mut lot) = lots.pop_front() else {
            break;
        };
        let take = left.min(lot.quantity);
        consumed.push(Lot {
            date: lot.date,
            quantity: take,
        });
        lot.quantity -= take;
        left -= take;
        if lot.quantity > 0 {
            lots.push_front(lot);
        }
    }
    consumed
}

fn estimated_tax(sale_date: NaiveDate, gain: f64, lots: &[Lot]) -> f64 {
    if gain <= 0.0 || lots.is_empty() {
        return 0.0;
    }
    let total: u32 = lots.iter().map(|lot| lot.quantity).sum();
    if total == 0 {
        return 0.0;
    }
    let (long_rate, short_rate) = tax_rates(sale_date);
    let per_unit = gain / f64::from(total);
    let tax: f64 = lots
        .iter()
        .map(|lot| {
            let rate = if (sale_date - lot.date).num_days() > 365 {
                long_rate
            } else {
                short_rate
            };
            per_unit * f64::from(lot.quantity) * rate
        })
        .sum();
    round_money(tax)
}

fn ordered(transactions: &[StockTransaction]) -> Vec<StockTransaction> {
    let mut all = transactions.to_vec();
    all.sort_by(|a, b| {
        a.trade_date
            .cmp(&b.trade_date)
            .then_with(|| match (a.kind, b.kind) {
                (StockTransactionKind::Purchase, StockTransactionKind::Sale) => {
                    std::cmp::Ordering::Less
                }
                (StockTransactionKind::Sale, StockTransactionKind::Purchase) => {
                    std::cmp::Ordering::Greater
                }
                _ => a.id.cmp(&b.id),
            })
    });
    all
}

fn states(transactions: &[StockTransaction]) -> BTreeMap<String, PositionState> {
    let mut states: BTreeMap<String, PositionState> = BTreeMap::new();
    for transaction in ordered(transactions) {
        let state = states.entry(transaction.symbol.clone()).or_default();
        match transaction.kind {
            StockTransactionKind::Purchase => {
                state.quantity = state.quantity.saturating_add(transaction.quantity);
                state.cost +=
                    f64::from(transaction.quantity) * transaction.price + transaction.fees;
                if let Some(day) = date(&transaction.trade_date) {
                    state.lots.push_back(Lot {
                        date: day,
                        quantity: transaction.quantity,
                    });
                }
            }
            StockTransactionKind::Sale => {
                if transaction.quantity <= state.quantity && state.quantity > 0 {
                    let average = state.cost / f64::from(state.quantity);
                    let basis = average * f64::from(transaction.quantity);
                    let proceeds = f64::from(transaction.quantity) * transaction.price
                        - transaction.fees
                        - transaction.tax;
                    state.realised += proceeds - basis;
                    state.cost = (state.cost - basis).max(0.0);
                    state.quantity -= transaction.quantity;
                    consume_lots(&mut state.lots, transaction.quantity);
                }
            }
        }
        state.transactions.push(transaction);
    }
    states
}

pub fn validate_transactions(transactions: &[StockTransaction]) -> Result<(), String> {
    let mut quantities: BTreeMap<String, u32> = BTreeMap::new();
    for transaction in ordered(transactions) {
        let quantity = quantities.entry(transaction.symbol.clone()).or_default();
        match transaction.kind {
            StockTransactionKind::Purchase => *quantity += transaction.quantity,
            StockTransactionKind::Sale if transaction.quantity <= *quantity => {
                *quantity -= transaction.quantity;
            }
            StockTransactionKind::Sale => {
                return Err(format!(
                    "That sale is earlier than enough recorded {} purchases.",
                    transaction.symbol
                ));
            }
        }
    }
    Ok(())
}

#[allow(clippy::too_many_arguments)]
pub fn estimate_trade(
    transactions: &[StockTransaction],
    symbol: &str,
    kind: StockTransactionKind,
    source: Option<StockAcquisitionSource>,
    trade_date: NaiveDate,
    quantity: u32,
    price: f64,
    fees_override: Option<f64>,
) -> Result<StockTradeEstimate, String> {
    if quantity == 0 || !price.is_finite() || price < 0.0 {
        return Err("Enter a valid quantity and price.".to_owned());
    }
    let gross = round_money(f64::from(quantity) * price);
    let charges = fees_override
        .filter(|value| value.is_finite() && *value >= 0.0)
        .map_or_else(
            || estimated_charges(kind, source, trade_date, gross),
            |fees| StockTradeCharges {
                broker: 0.0,
                sebon: 0.0,
                dp: 0.0,
                total: round_money(fees),
            },
        );
    if kind == StockTransactionKind::Purchase {
        return Ok(StockTradeEstimate {
            gross,
            net: round_money(gross + charges.total),
            charges,
            tax: 0.0,
            realised_profit_loss: None,
            remaining_quantity: None,
        });
    }

    // A backfilled sale can only use holdings that existed on its date. Future
    // purchases must not inflate its available quantity or alter its WACC.
    let relevant: Vec<StockTransaction> = transactions
        .iter()
        .filter(|transaction| date(&transaction.trade_date).is_some_and(|day| day <= trade_date))
        .cloned()
        .collect();
    let state = states(&relevant).remove(symbol).unwrap_or_default();
    if quantity > state.quantity {
        return Err(format!(
            "Only {} {symbol} kitta are available to sell.",
            state.quantity
        ));
    }
    let average = if state.quantity == 0 {
        0.0
    } else {
        state.cost / f64::from(state.quantity)
    };
    let gain_before_tax = gross - charges.total - average * f64::from(quantity);
    let mut lots = state.lots;
    let consumed = consume_lots(&mut lots, quantity);
    let tax = estimated_tax(trade_date, gain_before_tax, &consumed);
    Ok(StockTradeEstimate {
        gross,
        net: round_money(gross - charges.total - tax),
        charges,
        tax,
        realised_profit_loss: Some(round_money(gain_before_tax - tax)),
        remaining_quantity: Some(state.quantity - quantity),
    })
}

pub fn snapshot(transactions: &[StockTransaction], prices: &[StockPrice]) -> StockPortfolio {
    let prices: BTreeMap<String, f64> = prices
        .iter()
        .filter(|price| price.price.is_finite() && price.price >= 0.0)
        .map(|price| (price.symbol.to_uppercase(), price.price))
        .collect();
    let mut positions = Vec::new();
    for (symbol, state) in states(transactions) {
        let invested = round_money(state.cost);
        let market_price = prices.get(&symbol).copied();
        let market_value = market_price.map(|price| round_money(price * f64::from(state.quantity)));
        let unrealised = market_value.map(|value| round_money(value - invested));
        let unrealised_percent = unrealised.and_then(|value| {
            (invested > 0.0).then_some((value / invested * 10_000.0).round() / 100.0)
        });
        positions.push(StockPosition {
            symbol,
            quantity: state.quantity,
            average_cost: if state.quantity == 0 {
                0.0
            } else {
                round_money(invested / f64::from(state.quantity))
            },
            invested,
            market_price,
            market_value,
            unrealised_profit_loss: unrealised,
            unrealised_percent,
            realised_profit_loss: round_money(state.realised),
            transactions: state.transactions,
        });
    }
    positions.sort_by(|a, b| {
        b.quantity
            .cmp(&a.quantity)
            .then_with(|| a.symbol.cmp(&b.symbol))
    });
    let invested = round_money(positions.iter().map(|position| position.invested).sum());
    let active: Vec<&StockPosition> = positions
        .iter()
        .filter(|position| position.quantity > 0)
        .collect();
    let market_value = active
        .iter()
        .all(|position| position.market_value.is_some())
        .then(|| {
            round_money(
                active
                    .iter()
                    .filter_map(|position| position.market_value)
                    .sum(),
            )
        });
    StockPortfolio {
        invested,
        market_value,
        unrealised_profit_loss: market_value.map(|value| round_money(value - invested)),
        realised_profit_loss: round_money(
            positions
                .iter()
                .map(|position| position.realised_profit_loss)
                .sum(),
        ),
        positions,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn purchase(id: &str, day: &str, quantity: u32, price: f64) -> StockTransaction {
        StockTransaction {
            id: id.into(),
            symbol: "GBLBS".into(),
            kind: StockTransactionKind::Purchase,
            trade_date: day.into(),
            quantity,
            price,
            fees: 0.0,
            tax: 0.0,
            fees_estimated: false,
            tax_estimated: false,
            source: Some(StockAcquisitionSource::Secondary),
            note: String::new(),
        }
    }

    #[test]
    fn multiple_purchases_become_one_weighted_position() {
        let portfolio = snapshot(
            &[
                purchase("a", "2025-01-01", 100, 500.0),
                purchase("b", "2026-01-01", 50, 620.0),
            ],
            &[StockPrice {
                symbol: "GBLBS".into(),
                price: 678.0,
            }],
        );
        let position = &portfolio.positions[0];
        assert_eq!(position.quantity, 150);
        assert_eq!(position.average_cost, 540.0);
        assert_eq!(position.unrealised_profit_loss, Some(20_700.0));
    }

    #[test]
    fn a_sale_reduces_quantity_and_records_the_result() {
        let mut transactions = vec![purchase("a", "2025-01-01", 100, 500.0)];
        transactions.push(StockTransaction {
            id: "b".into(),
            symbol: "GBLBS".into(),
            kind: StockTransactionKind::Sale,
            trade_date: "2026-02-01".into(),
            quantity: 40,
            price: 700.0,
            fees: 100.0,
            tax: 390.0,
            fees_estimated: false,
            tax_estimated: false,
            source: None,
            note: String::new(),
        });
        let position = &snapshot(&transactions, &[]).positions[0];
        assert_eq!(position.quantity, 60);
        assert_eq!(position.invested, 30_000.0);
        assert_eq!(position.realised_profit_loss, 7_510.0);
    }

    #[test]
    fn a_backdated_sale_before_its_purchase_is_rejected() {
        let mut transactions = vec![purchase("a", "2026-02-01", 10, 500.0)];
        transactions.push(StockTransaction {
            id: "b".into(),
            symbol: "GBLBS".into(),
            kind: StockTransactionKind::Sale,
            trade_date: "2026-01-01".into(),
            quantity: 5,
            price: 600.0,
            fees: 0.0,
            tax: 0.0,
            fees_estimated: true,
            tax_estimated: true,
            source: None,
            note: String::new(),
        });
        assert!(validate_transactions(&transactions).is_err());
    }
}
