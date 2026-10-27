-- Data migration: the games listed on the "Dostt Call Games" page.
-- Created with `npm run db:migrate:create -- --name seed_games` and filled in by hand.
INSERT INTO "games" ("code", "name", "min_players", "max_players", "enabled", "updated_at") VALUES
    ('rps',         'Rock Paper Scissors', 2, 2, true, CURRENT_TIMESTAMP),
    ('ludo',        'Ludo',                2, 4, true, CURRENT_TIMESTAMP),
    ('tic_tac_toe', 'Tic-tac-toe',         2, 2, true, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
