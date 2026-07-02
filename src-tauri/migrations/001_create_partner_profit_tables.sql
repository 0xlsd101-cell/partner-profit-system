CREATE TABLE IF NOT EXISTS app_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO app_metadata (key, value, updated_at)
  VALUES ('schemaVersion', '1', datetime('now'));

CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  month TEXT,
  year INTEGER,
  member_id TEXT,
  settlement_id TEXT,
  status TEXT,
  name TEXT,
  created_at TEXT,
  updated_at TEXT,
  record_type TEXT
);

CREATE TABLE IF NOT EXISTS capital_lots (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  month TEXT,
  year INTEGER,
  member_id TEXT,
  settlement_id TEXT,
  status TEXT,
  name TEXT,
  created_at TEXT,
  updated_at TEXT,
  record_type TEXT
);

CREATE TABLE IF NOT EXISTS capital_transactions (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  month TEXT,
  year INTEGER,
  member_id TEXT,
  settlement_id TEXT,
  status TEXT,
  name TEXT,
  created_at TEXT,
  updated_at TEXT,
  record_type TEXT
);

CREATE TABLE IF NOT EXISTS monthly_settlements (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  month TEXT,
  year INTEGER,
  member_id TEXT,
  settlement_id TEXT,
  status TEXT,
  name TEXT,
  created_at TEXT,
  updated_at TEXT,
  record_type TEXT
);

CREATE TABLE IF NOT EXISTS monthly_allocations (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  month TEXT,
  year INTEGER,
  member_id TEXT,
  settlement_id TEXT,
  status TEXT,
  name TEXT,
  created_at TEXT,
  updated_at TEXT,
  record_type TEXT
);

CREATE TABLE IF NOT EXISTS dividend_payments (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  month TEXT,
  year INTEGER,
  member_id TEXT,
  settlement_id TEXT,
  status TEXT,
  name TEXT,
  created_at TEXT,
  updated_at TEXT,
  record_type TEXT
);

CREATE TABLE IF NOT EXISTS adjustment_records (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  month TEXT,
  year INTEGER,
  member_id TEXT,
  settlement_id TEXT,
  status TEXT,
  name TEXT,
  created_at TEXT,
  updated_at TEXT,
  record_type TEXT
);

CREATE TABLE IF NOT EXISTS annual_dividend_confirmations (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  month TEXT,
  year INTEGER,
  member_id TEXT,
  settlement_id TEXT,
  status TEXT,
  name TEXT,
  created_at TEXT,
  updated_at TEXT,
  record_type TEXT
);

CREATE TABLE IF NOT EXISTS operation_logs (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  month TEXT,
  year INTEGER,
  member_id TEXT,
  settlement_id TEXT,
  status TEXT,
  name TEXT,
  created_at TEXT,
  updated_at TEXT,
  record_type TEXT
);

CREATE TABLE IF NOT EXISTS profit_calculator_records (
  id TEXT PRIMARY KEY,
  payload TEXT NOT NULL,
  month TEXT,
  year INTEGER,
  member_id TEXT,
  settlement_id TEXT,
  status TEXT,
  name TEXT,
  created_at TEXT,
  updated_at TEXT,
  record_type TEXT
);

CREATE INDEX IF NOT EXISTS idx_members_month ON members(month);
CREATE INDEX IF NOT EXISTS idx_members_member_id ON members(member_id);
CREATE INDEX IF NOT EXISTS idx_members_settlement_id ON members(settlement_id);
CREATE INDEX IF NOT EXISTS idx_members_status ON members(status);
CREATE INDEX IF NOT EXISTS idx_members_year ON members(year);

CREATE INDEX IF NOT EXISTS idx_capital_lots_month ON capital_lots(month);
CREATE INDEX IF NOT EXISTS idx_capital_lots_member_id ON capital_lots(member_id);
CREATE INDEX IF NOT EXISTS idx_capital_lots_settlement_id ON capital_lots(settlement_id);
CREATE INDEX IF NOT EXISTS idx_capital_lots_status ON capital_lots(status);
CREATE INDEX IF NOT EXISTS idx_capital_lots_year ON capital_lots(year);

CREATE INDEX IF NOT EXISTS idx_capital_transactions_month ON capital_transactions(month);
CREATE INDEX IF NOT EXISTS idx_capital_transactions_member_id ON capital_transactions(member_id);
CREATE INDEX IF NOT EXISTS idx_capital_transactions_settlement_id ON capital_transactions(settlement_id);
CREATE INDEX IF NOT EXISTS idx_capital_transactions_status ON capital_transactions(status);
CREATE INDEX IF NOT EXISTS idx_capital_transactions_year ON capital_transactions(year);

CREATE INDEX IF NOT EXISTS idx_monthly_settlements_month ON monthly_settlements(month);
CREATE INDEX IF NOT EXISTS idx_monthly_settlements_member_id ON monthly_settlements(member_id);
CREATE INDEX IF NOT EXISTS idx_monthly_settlements_settlement_id ON monthly_settlements(settlement_id);
CREATE INDEX IF NOT EXISTS idx_monthly_settlements_status ON monthly_settlements(status);
CREATE INDEX IF NOT EXISTS idx_monthly_settlements_year ON monthly_settlements(year);

CREATE INDEX IF NOT EXISTS idx_monthly_allocations_month ON monthly_allocations(month);
CREATE INDEX IF NOT EXISTS idx_monthly_allocations_member_id ON monthly_allocations(member_id);
CREATE INDEX IF NOT EXISTS idx_monthly_allocations_settlement_id ON monthly_allocations(settlement_id);
CREATE INDEX IF NOT EXISTS idx_monthly_allocations_status ON monthly_allocations(status);
CREATE INDEX IF NOT EXISTS idx_monthly_allocations_year ON monthly_allocations(year);

CREATE INDEX IF NOT EXISTS idx_dividend_payments_month ON dividend_payments(month);
CREATE INDEX IF NOT EXISTS idx_dividend_payments_member_id ON dividend_payments(member_id);
CREATE INDEX IF NOT EXISTS idx_dividend_payments_settlement_id ON dividend_payments(settlement_id);
CREATE INDEX IF NOT EXISTS idx_dividend_payments_status ON dividend_payments(status);
CREATE INDEX IF NOT EXISTS idx_dividend_payments_year ON dividend_payments(year);

CREATE INDEX IF NOT EXISTS idx_adjustment_records_month ON adjustment_records(month);
CREATE INDEX IF NOT EXISTS idx_adjustment_records_member_id ON adjustment_records(member_id);
CREATE INDEX IF NOT EXISTS idx_adjustment_records_settlement_id ON adjustment_records(settlement_id);
CREATE INDEX IF NOT EXISTS idx_adjustment_records_status ON adjustment_records(status);
CREATE INDEX IF NOT EXISTS idx_adjustment_records_year ON adjustment_records(year);

CREATE INDEX IF NOT EXISTS idx_annual_dividend_confirmations_month ON annual_dividend_confirmations(month);
CREATE INDEX IF NOT EXISTS idx_annual_dividend_confirmations_member_id ON annual_dividend_confirmations(member_id);
CREATE INDEX IF NOT EXISTS idx_annual_dividend_confirmations_settlement_id ON annual_dividend_confirmations(settlement_id);
CREATE INDEX IF NOT EXISTS idx_annual_dividend_confirmations_status ON annual_dividend_confirmations(status);
CREATE INDEX IF NOT EXISTS idx_annual_dividend_confirmations_year ON annual_dividend_confirmations(year);

CREATE INDEX IF NOT EXISTS idx_operation_logs_month ON operation_logs(month);
CREATE INDEX IF NOT EXISTS idx_operation_logs_member_id ON operation_logs(member_id);
CREATE INDEX IF NOT EXISTS idx_operation_logs_settlement_id ON operation_logs(settlement_id);
CREATE INDEX IF NOT EXISTS idx_operation_logs_status ON operation_logs(status);
CREATE INDEX IF NOT EXISTS idx_operation_logs_year ON operation_logs(year);

CREATE INDEX IF NOT EXISTS idx_profit_calculator_records_month ON profit_calculator_records(month);
CREATE INDEX IF NOT EXISTS idx_profit_calculator_records_member_id ON profit_calculator_records(member_id);
CREATE INDEX IF NOT EXISTS idx_profit_calculator_records_settlement_id ON profit_calculator_records(settlement_id);
CREATE INDEX IF NOT EXISTS idx_profit_calculator_records_status ON profit_calculator_records(status);
CREATE INDEX IF NOT EXISTS idx_profit_calculator_records_year ON profit_calculator_records(year);
