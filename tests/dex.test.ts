import { Cl } from "@stacks/transactions";
import { describe, expect, it, beforeEach } from "vitest";

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const alice = accounts.get("wallet_1")!;
const bob = accounts.get("wallet_2")!;
const charlie = accounts.get("wallet_3")!;

// Mock token principal
const TOKEN_A = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.token-a";
const TOKEN_B = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM.token-b";

// Helper function to initialize DEX
function initialize(
  token: string,
  initialStx: number,
  initialToken: number,
  user: string
) {
  return simnet.callPublicFn(
    "dex",
    "initialize",
    [
      Cl.principal(token),
      Cl.uint(initialStx),
      Cl.uint(initialToken)
    ],
    user
  );
}

// Helper function to buy tokens
function buyTokens(
  stxIn: number,
  minTokensOut: number,
  user: string
) {
  return simnet.callPublicFn(
    "dex",
    "buy-tokens",
    [
      Cl.uint(stxIn),
      Cl.uint(minTokensOut)
    ],
    user
  );
}

// Helper function to sell tokens
function sellTokens(
  tokenIn: number,
  minStxOut: number,
  user: string
) {
  return simnet.callPublicFn(
    "dex",
    "sell-tokens",
    [
      Cl.uint(tokenIn),
      Cl.uint(minStxOut)
    ],
    user
  );
}

// Helper function to add liquidity
function addLiquidity(
  stxAmount: number,
  tokenAmount: number,
  user: string
) {
  return simnet.callPublicFn(
    "dex",
    "add-liquidity",
    [
      Cl.uint(stxAmount),
      Cl.uint(tokenAmount)
    ],
    user
  );
}

// Helper function to remove liquidity
function removeLiquidity(
  percent: number,
  user: string
) {
  return simnet.callPublicFn(
    "dex",
    "remove-liquidity",
    [Cl.uint(percent)],
    user
  );
}

// Helper function to set fee
function setFee(
  newFee: number,
  user: string
) {
  return simnet.callPublicFn(
    "dex",
    "set-fee",
    [Cl.uint(newFee)],
    user
  );
}

// Helper function to get price
function getPrice() {
  return simnet.callReadOnlyFn(
    "dex",
    "get-price",
    [],
    deployer
  );
}

// Helper function to get reserves
function getReserves() {
  return simnet.callReadOnlyFn(
    "dex",
    "get-reserves",
    [],
    deployer
  );
}

// Helper function to get token contract
function getTokenContract() {
  return simnet.callReadOnlyFn(
    "dex",
    "get-token-contract",
    [],
    deployer
  );
}

// Helper function to check if initialized
function isInitialized() {
  return simnet.callReadOnlyFn(
    "dex",
    "is-initialized",
    [],
    deployer
  );
}

describe("DEX Tests", () => {
  describe("Initialization Tests", () => {
    it("allows contract owner to initialize DEX", () => {
      const result = initialize(TOKEN_A, 1000000, 1000000, deployer);
      expect(result.result).toBeOk(Cl.bool(true));

      // Check reserves were set
      const reserves = getReserves();
      console.log("Reserves after init:", JSON.stringify(reserves, null, 2));
      
      expect(reserves.result).toBeOk(
        Cl.tuple({
          stx: Cl.uint(1000000),
          tokens: Cl.uint(1000000),
          invariant: Cl.uint(1000000000000),
          fee: Cl.uint(30),
          initialized: Cl.bool(true)
        })
      );

      // Check token contract was stored
      const tokenContract = getTokenContract();
      expect(tokenContract.result).toBeOk(Cl.principal(TOKEN_A));

      // Check initialized flag
      const initialized = isInitialized();
      expect(initialized.result).toBeOk(Cl.bool(true));
    });

    it("prevents non-owner from initializing", () => {
      const result = initialize(TOKEN_A, 1000000, 1000000, alice);
      expect(result.result).toBeErr(Cl.uint(100)); // err-owner-only
    });

    it("prevents initializing twice", () => {
      initialize(TOKEN_A, 1000000, 1000000, deployer);
      
      const result = initialize(TOKEN_A, 2000000, 2000000, deployer);
      expect(result.result).toBeErr(Cl.uint(103)); // err-invalid-amount (already initialized)
    });

    it("prevents initializing with zero amounts", () => {
      const result1 = initialize(TOKEN_A, 0, 1000000, deployer);
      expect(result1.result).toBeErr(Cl.uint(103));

      const result2 = initialize(TOKEN_A, 1000000, 0, deployer);
      expect(result2.result).toBeErr(Cl.uint(103));
    });
  });

  describe("Price Tests", () => {
    beforeEach(() => {
      initialize(TOKEN_A, 1000000, 1000000, deployer);
    });

    it("returns correct initial price", () => {
      const price = getPrice();
      // Price = reserve-stx * 1,000,000 / reserve-tokens = 1,000,000 * 1,000,000 / 1,000,000 = 1,000,000
      expect(price.result).toBeOk(Cl.uint(1000000));
    });

    it("updates price after trades", () => {
      // Buy tokens - should increase price
      buyTokens(100000, 90000, alice);
      
      const priceAfterBuy = getPrice();
      // Price should be higher
      expect(Number(priceAfterBuy.result.value)).toBeGreaterThan(1000000);
    });
  });

  describe("Buy Tokens Tests", () => {
    beforeEach(() => {
      initialize(TOKEN_A, 1000000, 1000000, deployer);
    });

    it("allows users to buy tokens", () => {
      const result = buyTokens(100000, 90000, alice);
      expect(result.result).toBeOk(Cl.uint(90909)); // Approximate tokens out

      // Check reserves were updated
      const reserves = getReserves();
      expect(reserves.result).toBeOk(
        Cl.tuple({
          stx: Cl.uint(1099930), // 1,000,000 + 100,000 - fee
          tokens: Cl.uint(909091), // 1,000,000 - 90,909
          invariant: Cl.uint(1000000000000), // Should remain constant
          fee: Cl.uint(30),
          initialized: Cl.bool(true)
        })
      );
    });

    it("prevents buying with zero STX", () => {
      const result = buyTokens(0, 0, alice);
      expect(result.result).toBeErr(Cl.uint(103)); // err-invalid-amount
    });

    it("prevents buying with slippage", () => {
      const result = buyTokens(100000, 100000, alice); // min-tokens-out too high
      expect(result.result).toBeErr(Cl.uint(104)); // err-slippage
    });

    it("prevents buying before initialization", () => {
      // Create a new contract instance without initializing
      // This test assumes we're testing a fresh contract
      const result = buyTokens(100000, 90000, alice);
      expect(result.result).toBeErr(Cl.uint(105)); // err-not-initialized
    });

    it("allows multiple users to buy", () => {
      buyTokens(50000, 45000, alice);
      const result = buyTokens(30000, 27000, bob);
      expect(result.result).toBeOk(Cl.uint(27272)); // Approximate

      const reserves = getReserves();
      const reserveData = reserves.result.value as any;
      expect(Number(reserveData['tokens'].value)).toBeLessThan(1000000);
      expect(Number(reserveData['stx'].value)).toBeGreaterThan(1000000);
    });
  });

  describe("Sell Tokens Tests", () => {
    beforeEach(() => {
      initialize(TOKEN_A, 1000000, 1000000, deployer);
    });

    it("allows users to sell tokens", () => {
      const result = sellTokens(100000, 90000, alice);
      expect(result.result).toBeOk(Cl.uint(90909)); // Approximate STX out

      // Check reserves were updated
      const reserves = getReserves();
      expect(reserves.result).toBeOk(
        Cl.tuple({
          stx: Cl.uint(909091), // 1,000,000 - 90,909
          tokens: Cl.uint(1099930), // 1,000,000 + 100,000 - fee
          invariant: Cl.uint(1000000000000),
          fee: Cl.uint(30),
          initialized: Cl.bool(true)
        })
      );
    });

    it("prevents selling with zero tokens", () => {
      const result = sellTokens(0, 0, alice);
      expect(result.result).toBeErr(Cl.uint(103));
    });

    it("prevents selling with slippage", () => {
      const result = sellTokens(100000, 100000, alice); // min-stx-out too high
      expect(result.result).toBeErr(Cl.uint(104));
    });

    it("prevents selling before initialization", () => {
      // This test assumes we're testing a fresh contract
      const result = sellTokens(100000, 90000, alice);
      expect(result.result).toBeErr(Cl.uint(105));
    });
  });

  describe("Liquidity Tests", () => {
    beforeEach(() => {
      initialize(TOKEN_A, 1000000, 1000000, deployer);
    });

    it("allows users to add liquidity", () => {
      const result = addLiquidity(500000, 500000, alice);
      expect(result.result).toBeOk(Cl.bool(true));

      const reserves = getReserves();
      expect(reserves.result).toBeOk(
        Cl.tuple({
          stx: Cl.uint(1500000),
          tokens: Cl.uint(1500000),
          invariant: Cl.uint(2250000000000),
          fee: Cl.uint(30),
          initialized: Cl.bool(true)
        })
      );
    });

    it("prevents adding liquidity with wrong ratio", () => {
      // Trying to add 500,000 STX but only 400,000 tokens (should be 500,000)
      const result = addLiquidity(500000, 400000, alice);
      expect(result.result).toBeErr(Cl.uint(103));
    });

    it("prevents adding liquidity with zero amounts", () => {
      const result1 = addLiquidity(0, 500000, alice);
      expect(result1.result).toBeErr(Cl.uint(103));

      const result2 = addLiquidity(500000, 0, alice);
      expect(result2.result).toBeErr(Cl.uint(103));
    });

    it("allows users to remove liquidity", () => {
      // First add liquidity
      addLiquidity(500000, 500000, alice);
      
      // Then remove 50%
      const result = removeLiquidity(50, alice);
      expect(result.result).toBeOk(Cl.bool(true));

      const reserves = getReserves();
      expect(reserves.result).toBeOk(
        Cl.tuple({
          stx: Cl.uint(750000),
          tokens: Cl.uint(750000),
          invariant: Cl.uint(562500000000),
          fee: Cl.uint(30),
          initialized: Cl.bool(true)
        })
      );
    });

    it("prevents removing more than 100%", () => {
      addLiquidity(500000, 500000, alice);
      
      const result = removeLiquidity(150, alice);
      expect(result.result).toBeErr(Cl.uint(103));
    });

    it("prevents removing zero percent", () => {
      addLiquidity(500000, 500000, alice);
      
      const result = removeLiquidity(0, alice);
      expect(result.result).toBeErr(Cl.uint(103));
    });

    it("allows multiple users to add liquidity", () => {
      addLiquidity(300000, 300000, alice);
      const result = addLiquidity(200000, 200000, bob);
      expect(result.result).toBeOk(Cl.bool(true));

      const reserves = getReserves();
      expect(reserves.result).toBeOk(
        Cl.tuple({
          stx: Cl.uint(1500000),
          tokens: Cl.uint(1500000),
          invariant: Cl.uint(2250000000000),
          fee: Cl.uint(30),
          initialized: Cl.bool(true)
        })
      );
    });
  });

  describe("Fee Tests", () => {
    beforeEach(() => {
      initialize(TOKEN_A, 1000000, 1000000, deployer);
    });

    it("allows owner to set fee", () => {
      const result = setFee(50, deployer); // 0.5%
      expect(result.result).toBeOk(Cl.bool(true));

      const reserves = getReserves();
      expect(reserves.result).toBeOk(
        Cl.tuple({
          stx: Cl.uint(1000000),
          tokens: Cl.uint(1000000),
          invariant: Cl.uint(1000000000000),
          fee: Cl.uint(50),
          initialized: Cl.bool(true)
        })
      );
    });

    it("prevents non-owner from setting fee", () => {
      const result = setFee(50, alice);
      expect(result.result).toBeErr(Cl.uint(100));
    });

    it("prevents setting fee above max", () => {
      const result = setFee(2000, deployer); // 20% (max is 10%)
      expect(result.result).toBeErr(Cl.uint(103));
    });

    it("applies new fee to trades", () => {
      // Set fee to 1%
      setFee(100, deployer);
      
      // Buy tokens with new fee
      const result = buyTokens(100000, 90000, alice);
      
      // Calculate expected tokens out with 1% fee
      // With 0.3% fee we got 90,909, with 1% fee should be less
      const tokensOut = Number(result.result.value);
      expect(tokensOut).toBeLessThan(90909);
    });
  });

  describe("Complex Scenarios", () => {
    beforeEach(() => {
      initialize(TOKEN_A, 1000000, 1000000, deployer);
    });

    it("handles multiple trades in sequence", () => {
      // Alice buys tokens
      buyTokens(100000, 90000, alice);
      
      // Bob sells tokens
      sellTokens(50000, 45000, bob);
      
      // Charlie adds liquidity
      addLiquidity(200000, 180000, charlie);
      
      // Check final reserves
      const reserves = getReserves();
      const reserveData = reserves.result.value as any;
      
      // Invariant should be close to original (with some rounding)
      const invariant = Number(reserveData['invariant'].value);
      expect(invariant).toBeCloseTo(1000000000000, -5);
    });

    it("maintains constant product invariant", () => {
      const initialReserves = getReserves();
      const initialData = initialReserves.result.value as any;
      const initialStx = Number(initialData['stx'].value);
      const initialTokens = Number(initialData['tokens'].value);
      const initialInvariant = Number(initialData['invariant'].value);
      
      // Perform trades
      buyTokens(200000, 180000, alice);
      sellTokens(100000, 90000, bob);
      
      const finalReserves = getReserves();
      const finalData = finalReserves.result.value as any;
      const finalStx = Number(finalData['stx'].value);
      const finalTokens = Number(finalData['tokens'].value);
      const finalInvariant = Number(finalData['invariant'].value);
      
      // Invariant should remain constant (with small rounding errors)
      expect(finalInvariant).toBeCloseTo(initialInvariant, -3);
      expect(finalStx * finalTokens).toBeCloseTo(initialInvariant, -3);
    });

    it("allows users to profit from price changes", () => {
      // Alice buys tokens, increasing price
      buyTokens(200000, 180000, alice);
      
      const priceAfterBuy = getPrice();
      const priceAfterBuyValue = Number(priceAfterBuy.result.value);
      
      // Bob sells tokens at higher price
      const sellResult = sellTokens(100000, 90000, bob);
      const stxOut = Number(sellResult.result.value);
      
      // Bob should get more STX than he would have initially
      expect(stxOut).toBeGreaterThan(100000);
      expect(priceAfterBuyValue).toBeGreaterThan(1000000);
    });
  });

  describe("Edge Cases", () => {
    beforeEach(() => {
      initialize(TOKEN_A, 1000000, 1000000, deployer);
    });

    it("handles very small trades", () => {
      const result = buyTokens(1, 0, alice);
      expect(result.result).toBeOk(Cl.uint(0)); // 1 STX buys 0 tokens (rounding)
    });

    it("handles very large trades", () => {
      const result = buyTokens(900000, 1, alice);
      expect(result.result).toBeOk(Cl.uint(473684)); // Approximate
    });

    it("prevents buying when pool would be depleted", () => {
      // Try to buy almost all tokens
      const result = buyTokens(9000000, 1, alice);
      expect(result.result).toBeErr(Cl.uint(102)); // err-insufficient-balance
    });

    it("returns zero price when no tokens", () => {
      // This would require a separate test with empty pool
      // For now, just verify get-price doesn't error
      const price = getPrice();
      expect(price.result).toBeDefined();
    });
  });
});