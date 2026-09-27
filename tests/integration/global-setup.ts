import { resetDatabase, TEST_DATABASE_URL } from "../helpers/db";

export default async function setup() {
  await resetDatabase(TEST_DATABASE_URL);
}
