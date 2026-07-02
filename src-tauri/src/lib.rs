use tauri_plugin_sql::{Migration, MigrationKind};

const SQLITE_CONNECTION: &str = "sqlite:partner-profit-system.sqlite";

fn sqlite_migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "create_partner_profit_tables",
        sql: include_str!("../migrations/001_create_partner_profit_tables.sql"),
        kind: MigrationKind::Up,
    }]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations(SQLITE_CONNECTION, sqlite_migrations())
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
