import { describe, it, expect, beforeEach } from "vitest";
import { stringAsciiCV, uintCV, buffCV, someCV, noneCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 200;
const ERR_CHALLENGE_NOT_COMPLETED = 201;
const ERR_NFT_ALREADY_MINTED = 202;
const ERR_INVALID_CHALLENGE_ID = 203;
const ERR_USER_NOT_PARTICIPANT = 204;
const ERR_PROOF_NOT_SUBMITTED = 205;
const ERR_METADATA_URI_TOO_LONG = 206;
const ERR_INVALID_TOKEN_ID = 208;
const ERR_TOKEN_NOT_OWNED = 209;

interface NFTMetadata {
  challengeId: number;
  title: string;
  category: string;
  difficulty: number;
  completionDate: number;
  proofHash: Uint8Array;
  metadataUri: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class NFTMinterMock {
  state: {
    lastTokenId: number;
    mintFee: number;
    royaltyRecipient: string;
    royaltyPercent: number;
    tokenMetadata: Map<number, NFTMetadata>;
    mintedNfts: Map<string, number>;
    nftOwners: Map<number, string>;
  } = {
    lastTokenId: 0,
    mintFee: 100,
    royaltyRecipient: "ST1ROYALTY",
    royaltyPercent: 500,
    tokenMetadata: new Map(),
    mintedNfts: new Map(),
    nftOwners: new Map(),
  };
  blockHeight: number = 100;
  caller: string = "ST1USER";
  stxTransfers: Array<{ amount: number; from: string; to: string }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      lastTokenId: 0,
      mintFee: 100,
      royaltyRecipient: "ST1ROYALTY",
      royaltyPercent: 500,
      tokenMetadata: new Map(),
      mintedNfts: new Map(),
      nftOwners: new Map(),
    };
    this.blockHeight = 100;
    this.caller = "ST1USER";
    this.stxTransfers = [];
  }

  getLastTokenId(): Result<number> {
    return { ok: true, value: this.state.lastTokenId };
  }

  getTokenMetadata(tokenId: number): NFTMetadata | null {
    return this.state.tokenMetadata.get(tokenId) || null;
  }

  getNftIdForUser(challengeId: number, user: string): number | null {
    return this.state.mintedNfts.get(`${challengeId}-${user}`) || null;
  }

  setMintFee(newFee: number): Result<boolean> {
    if (this.caller !== this.state.royaltyRecipient) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.mintFee = newFee;
    return { ok: true, value: true };
  }

  setRoyaltyInfo(recipient: string, percent: number): Result<boolean> {
    if (this.caller !== this.state.royaltyRecipient) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (percent > 1000) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.royaltyRecipient = recipient;
    this.state.royaltyPercent = percent;
    return { ok: true, value: true };
  }

  mintAchievement(
    challengeId: number,
    title: string,
    category: string,
    difficulty: number,
    proofHash: Uint8Array,
    metadataUri: string
  ): Result<number> {
    const key = `${challengeId}-${this.caller}`;
    if (this.state.mintedNfts.has(key)) return { ok: false, value: ERR_NFT_ALREADY_MINTED };
    if (metadataUri.length > 256) return { ok: false, value: ERR_METADATA_URI_TOO_LONG };
    if (!this.mockChallengeManager.completed(challengeId, this.caller)) return { ok: false, value: ERR_CHALLENGE_NOT_COMPLETED };
    if (!this.mockChallengeManager.proofSubmitted(challengeId, this.caller, proofHash)) return { ok: false, value: ERR_PROOF_NOT_SUBMITTED };
    this.stxTransfers.push({ amount: this.state.mintFee, from: this.caller, to: this.state.royaltyRecipient });
    const royalty = Math.floor((this.state.mintFee * this.state.royaltyPercent) / 10000);
    this.stxTransfers.push({ amount: royalty, from: this.caller, to: this.state.royaltyRecipient });
    const tokenId = this.state.lastTokenId + 1;
    this.state.nftOwners.set(tokenId, this.caller);
    this.state.tokenMetadata.set(tokenId, {
      challengeId,
      title,
      category,
      difficulty,
      completionDate: this.blockHeight,
      proofHash,
      metadataUri,
    });
    this.state.mintedNfts.set(key, tokenId);
    this.state.lastTokenId = tokenId;
    return { ok: true, value: tokenId };
  }

  transferAchievement(tokenId: number, recipient: string): Result<boolean> {
    const owner = this.state.nftOwners.get(tokenId);
    if (!owner) return { ok: false, value: ERR_INVALID_TOKEN_ID };
    if (owner !== this.caller) return { ok: false, value: ERR_TOKEN_NOT_OWNED };
    this.state.nftOwners.set(tokenId, recipient);
    return { ok: true, value: true };
  }

  burnAchievement(tokenId: number): Result<boolean> {
    const owner = this.state.nftOwners.get(tokenId);
    if (!owner) return { ok: false, value: ERR_INVALID_TOKEN_ID };
    if (owner !== this.caller) return { ok: false, value: ERR_TOKEN_NOT_OWNED };
    this.state.nftOwners.delete(tokenId);
    this.state.tokenMetadata.delete(tokenId);
    return { ok: true, value: true };
  }

  mockChallengeManager = {
    completed: (challengeId: number, user: string) => challengeId === 0 && user === this.caller,
    proofSubmitted: (challengeId: number, user: string, hash: Uint8Array) => 
      challengeId === 0 && user === this.caller && hash.length === 32,
  };
}

describe("NFTMinter", () => {
  let contract: NFTMinterMock;

  beforeEach(() => {
    contract = new NFTMinterMock();
    contract.reset();
  });

  it("mints NFT achievement successfully", () => {
    const proofHash = new Uint8Array(32);
    const result = contract.mintAchievement(
      0,
      "5K Run Master",
      "running",
      3,
      proofHash,
      "ipfs://Qm..."
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(1);
    const metadata = contract.getTokenMetadata(1);
    expect(metadata?.title).toBe("5K Run Master");
    expect(metadata?.challengeId).toBe(0);
    expect(metadata?.completionDate).toBe(100);
    expect(contract.stxTransfers.length).toBe(2);
    expect(contract.stxTransfers[0].amount).toBe(100);
    expect(contract.stxTransfers[1].amount).toBe(5);
  });

  it("rejects duplicate mint for same challenge", () => {
    const proofHash = new Uint8Array(32);
    contract.mintAchievement(0, "5K Run Master", "running", 3, proofHash, "ipfs://Qm...");
    const result = contract.mintAchievement(0, "Again", "running", 3, proofHash, "ipfs://Qm...");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NFT_ALREADY_MINTED);
  });

  it("rejects mint if challenge not completed", () => {
    contract.mockChallengeManager.completed = () => false;
    const proofHash = new Uint8Array(32);
    const result = contract.mintAchievement(1, "Invalid", "running", 3, proofHash, "ipfs://Qm...");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_CHALLENGE_NOT_COMPLETED);
  });

  it("rejects mint with invalid proof hash", () => {
    contract.mockChallengeManager.proofSubmitted = () => false;
    const proofHash = new Uint8Array(32);
    const result = contract.mintAchievement(0, "Invalid Proof", "running", 3, proofHash, "ipfs://Qm...");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_PROOF_NOT_SUBMITTED);
  });

  it("rejects metadata URI too long", () => {
    const longUri = "a".repeat(257);
    const proofHash = new Uint8Array(32);
    const result = contract.mintAchievement(0, "Long URI", "running", 3, proofHash, longUri);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_METADATA_URI_TOO_LONG);
  });

  it("transfers NFT successfully", () => {
    const proofHash = new Uint8Array(32);
    contract.mintAchievement(0, "5K Run Master", "running", 3, proofHash, "ipfs://Qm...");
    const result = contract.transferAchievement(1, "ST2NEWOWNER");
    expect(result.ok).toBe(true);
    expect(contract.state.nftOwners.get(1)).toBe("ST2NEWOWNER");
  });

  it("rejects transfer by non-owner", () => {
    const proofHash = new Uint8Array(32);
    contract.mintAchievement(0, "5K Run Master", "running", 3, proofHash, "ipfs://Qm...");
    contract.caller = "ST3HACKER";
    const result = contract.transferAchievement(1, "ST2NEW");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_TOKEN_NOT_OWNED);
  });

  it("burns NFT successfully", () => {
    const proofHash = new Uint8Array(32);
    contract.mintAchievement(0, "5K Run Master", "running", 3, proofHash, "ipfs://Qm...");
    const result = contract.burnAchievement(1);
    expect(result.ok).toBe(true);
    expect(contract.state.nftOwners.has(1)).toBe(false);
    expect(contract.state.tokenMetadata.has(1)).toBe(false);
  });

  it("sets mint fee by royalty recipient", () => {
    contract.caller = "ST1ROYALTY";
    const result = contract.setMintFee(200);
    expect(result.ok).toBe(true);
    expect(contract.state.mintFee).toBe(200);
  });

  it("rejects mint fee change by non-recipient", () => {
    const result = contract.setMintFee(200);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });
});