/**
 * @jest-environment node
 */
import {
  findCalendarFeedTokenByRawToken,
  mintCalendarFeedToken,
} from "@/lib/calendar-feed-token";

const mockGenerateShareToken = jest.fn();
jest.mock("@/lib/security", () => ({
  generateShareToken: (...args: unknown[]) => mockGenerateShareToken(...args),
}));

type StoredToken = {
  id: string;
  adminUserId: string;
  token: string;
  revokedAt: Date | null;
  createdAt: Date;
};

const store: StoredToken[] = [];

const mockUpdateMany = jest.fn();
const mockCreate = jest.fn();
const mockFindUnique = jest.fn();
const mockTransaction = jest.fn();

jest.mock("@/lib/db", () => ({
  db: {
    $transaction: (...args: unknown[]) => mockTransaction(...args),
    calendarFeedToken: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
    },
  },
}));

let tokenSerial = 0;

beforeEach(() => {
  store.length = 0;
  tokenSerial = 0;
  jest.clearAllMocks();
  mockGenerateShareToken.mockImplementation(() => `feed-token-${++tokenSerial}`);

  mockUpdateMany.mockImplementation(
    async ({
      where,
      data,
    }: {
      where: { adminUserId: string };
      data: { revokedAt: Date };
    }) => {
      for (const row of store) {
        if (row.adminUserId === where.adminUserId && row.revokedAt === null) {
          row.revokedAt = data.revokedAt;
        }
      }
      return { count: 1 };
    }
  );

  mockCreate.mockImplementation(async ({ data }: { data: { adminUserId: string; token: string } }) => {
    const row: StoredToken = {
      id: `id-${store.length + 1}`,
      adminUserId: data.adminUserId,
      token: data.token,
      revokedAt: null,
      createdAt: new Date(),
    };
    store.push(row);
    return row;
  });

  mockFindUnique.mockImplementation(async ({ where }: { where: { token: string } }) => {
    return store.find((r) => r.token === where.token) ?? null;
  });

  mockTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => {
    const tx = {
      calendarFeedToken: {
        updateMany: mockUpdateMany,
        create: mockCreate,
      },
    };
    return fn(tx);
  });
});

describe("mintCalendarFeedToken", () => {
  it("persists token from generateShareToken", async () => {
    const row = await mintCalendarFeedToken("admin-1");
    expect(mockGenerateShareToken).toHaveBeenCalled();
    expect(row.token).toBe("feed-token-1");
    expect(mockCreate).toHaveBeenCalledWith({
      data: { adminUserId: "admin-1", token: "feed-token-1" },
    });
  });

  it("revokes prior active token on second mint", async () => {
    await mintCalendarFeedToken("admin-1");
    await mintCalendarFeedToken("admin-1");
    expect(mockUpdateMany).toHaveBeenCalledTimes(2);
    const first = store.find((r) => r.token === "feed-token-1");
    const second = store.find((r) => r.token === "feed-token-2");
    expect(first?.revokedAt).toBeInstanceOf(Date);
    expect(second?.revokedAt).toBeNull();
    expect(await findCalendarFeedTokenByRawToken("feed-token-1")).toBeNull();
    expect(await findCalendarFeedTokenByRawToken("feed-token-2")).toMatchObject({
      adminUserId: "admin-1",
      token: "feed-token-2",
    });
  });
});
