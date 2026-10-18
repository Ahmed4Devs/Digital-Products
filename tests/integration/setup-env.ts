import { configureTestDatabase } from "../support/test-env";

// Runs inside each worker before its test files are imported.
configureTestDatabase();
