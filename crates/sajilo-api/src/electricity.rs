//! The electricity bill, from Nepal Electricity Authority's public bill check.

use chrono::NaiveDate;

dto! {
    /// An NEA office, as its bill check lists them: `205`, `KULESHOR`.
    pub struct NeaOffice {
        pub code: String,
        pub name: String,
    }

    /// What the bill check needs, entered once and kept on this computer
    /// only. Sent to NEA alone.
    pub struct NeaAccount {
        pub office_code: String,
        /// As printed on the bill: `101.02.003KA1GA`.
        pub sc_no: String,
        pub consumer_id: String,
    }

    /// One bill: a month's reading, or an arrears adjustment.
    pub struct ElectricityBill {
        /// The month as NEA names it, `Ashwin/2083`, or `ARREARS`.
        pub month: String,
        pub is_arrears: bool,
        /// The meter-reading day, which the rebate and penalty count from.
        pub bill_date: NaiveDate,
        pub units: u32,
        /// As billed, before rebate or penalty.
        pub amount: f64,
        /// What was, or is, payable after it.
        pub payable: f64,
        pub adjustment: BillAdjustment,
        /// Percent, e.g. `2` for the rebate, `5` for a penalty.
        pub adjustment_rate: f64,
        pub paid: bool,
        #[serde(default)]
        pub paid_on: Option<NaiveDate>,
        /// `ESEWA Company`, `KHALTI`, … as NEA records it.
        #[serde(default)]
        pub paid_via: Option<String>,
        /// Worked out when served, in the reader's language.
        #[serde(default)]
        pub bill_date_label: Option<String>,
        #[serde(default)]
        pub paid_on_label: Option<String>,
    }

    /// Everything the bill check returns for an account, newest bill first.
    pub struct ElectricityStatement {
        /// The office's own name for itself, `KULESWORE DC`.
        pub office: String,
        pub bills: Vec<ElectricityBill>,
        /// Paid ahead, in rupees; zero when nothing is.
        pub advance: f64,
        /// `2083-06` when NEA says the account is paid up to a month.
        #[serde(default)]
        pub paid_upto: Option<String>,
        /// Worked out when served, never cached: where the oldest unpaid
        /// month bill stands today.
        #[serde(default)]
        pub due: Option<BillDue>,
    }

    /// The bill to pay, and what paying it today costs.
    pub struct BillDue {
        pub month: String,
        /// Unpaid, all months and arrears together, as billed.
        pub total: f64,
        pub stage: DueStage,
        /// The last day of the current stage, when it has one.
        #[serde(default)]
        pub until: Option<NaiveDate>,
        #[serde(default)]
        pub days_left: Option<i32>,
        /// The total with the rebate, while it applies.
        #[serde(default)]
        pub with_rebate: Option<f64>,
        #[serde(default)]
        pub until_label: Option<String>,
    }
}

dto_enum! {
    pub enum BillAdjustment {
        Rebate,
        None,
        Penalty,
    }

    /// See `sajilo_core::electricity::Stage`.
    pub enum DueStage {
        Rebate,
        Normal,
        Penalty,
        Disconnection,
    }
}
