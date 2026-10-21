export interface User {
  id: string;
  name: string;
  apiKey: string;
  description: string;
}

export const PREDEFINED_USERS: User[] = [
  {
    id: "usr_alice",
    name: "Alice Smith",
    apiKey: "user_123",
    description: "Standard User",
  },
  {
    id: "usr_bob",
    name: "Bob Jones",
    apiKey: "user_456",
    description: "Developer Account",
  },
  {
    id: "usr_charlie",
    name: "Charlie Brown",
    apiKey: "user_789",
    description: "QA Tester",
  },
];

const VALID_API_KEYS = new Set(PREDEFINED_USERS.map((u) => u.apiKey));

export function findUserByApiKey(apiKey: string): User | undefined {
  return PREDEFINED_USERS.find((u) => u.apiKey === apiKey);
}

export function isValidApiKey(apiKey: string): boolean {
  return VALID_API_KEYS.has(apiKey);
}
