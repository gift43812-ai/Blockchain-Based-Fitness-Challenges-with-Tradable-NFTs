import { describe, it, expect, beforeEach } from "vitest";
import { uintCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 300;
const ERR_LISTING_NOT_FOUND = 301;
const ERR_INVALID_PRICE = 302;
const ERR_LISTING_EXPIRED = 303;
const ERR_ALREADY_LISTED = 304;
const ERR_NOT_LISTED = 305;
const ERR_BID_TOO_LOW = 308;
const ERR_BID_NOT_FOUND = 309;
const ERR_Marketplace_CLOSED = 311;
const ERR_INVALID_TOKEN_ID = 312;
const ERR_TOKEN_NOT_OWNED = 313;

interface Listing {
  tokenId: number;
  seller: string;
  price: number;
  expiry: number;
  minBidIncrement: number;
  highestBid: number;
  highestBidder: string | null;
  active: boolean;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class NFTMarketplaceMock {
  state: {
    marketplaceFeePercent: number;
    marketplaceFeeRecipient: string;
    marketplaceActive: boolean;
    listingCounter: number;
    listings: Map<number, Listing>;
    tokenListings: Map<number, number>;
    userBids: Map<string, number>;
  } = {
    marketplaceFeePercent: 250,
    marketplaceFeeRecipient: "ST1FEE",
    marketplaceActive: true,
    listingCounter: 0,
    listings: new Map(),
    tokenListings: new Map(),
    userBids: new Map(),
  };
  blockHeight: number = 100;
  caller: string = "ST1SELLER";
  stxTransfers: Array<{ amount: number; from: string | null; to: string }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      marketplaceFeePercent: 250,
      marketplaceFeeRecipient: "ST1FEE",
      marketplaceActive: true,
      listingCounter: 0,
      listings: new Map(),
      tokenListings: new Map(),
      userBids: new Map(),
    };
    this.blockHeight = 100;
    this.caller = "ST1SELLER";
    this.stxTransfers = [];
  }

  getListing(listingId: number): Listing | null {
    return this.state.listings.get(listingId) || null;
  }

  getListingIdForToken(tokenId: number): number | null {
    return this.state.tokenListings.get(tokenId) || null;
  }

  setMarketplaceFee(percent: number, recipient: string): Result<boolean> {
    if (this.caller !== this.state.marketplaceFeeRecipient)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (percent > 1000) return { ok: false, value: ERR_INVALID_PRICE };
    this.state.marketplaceFeePercent = percent;
    this.state.marketplaceFeeRecipient = recipient;
    return { ok: true, value: true };
  }

  toggleMarketplace(active: boolean): Result<boolean> {
    if (this.caller !== this.state.marketplaceFeeRecipient)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.marketplaceActive = active;
    return { ok: true, value: true };
  }

  listNft(
    tokenId: number,
    price: number,
    duration: number,
    minBidIncrement: number
  ): Result<number> {
    if (!this.state.marketplaceActive)
      return { ok: false, value: ERR_Marketplace_CLOSED };
    if (!this.mockNFTMinter.isOwner(tokenId, this.caller))
      return { ok: false, value: ERR_TOKEN_NOT_OWNED };
    if (this.state.tokenListings.has(tokenId))
      return { ok: false, value: ERR_ALREADY_LISTED };
    if (price <= 0 || duration <= 0 || minBidIncrement < 1)
      return { ok: false, value: ERR_INVALID_PRICE };
    const listingId = this.state.listingCounter;
    const listing: Listing = {
      tokenId,
      seller: this.caller,
      price,
      expiry: this.blockHeight + duration,
      minBidIncrement,
      highestBid: 0,
      highestBidder: null,
      active: true,
    };
    this.state.listings.set(listingId, listing);
    this.state.tokenListings.set(tokenId, listingId);
    this.state.listingCounter++;
    return { ok: true, value: listingId };
  }

  cancelListing(listingId: number): Result<boolean> {
    const listing = this.state.listings.get(listingId);
    if (!listing) return { ok: false, value: ERR_LISTING_NOT_FOUND };
    if (!listing.active) return { ok: false, value: ERR_NOT_LISTED };
    if (listing.seller !== this.caller)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    listing.active = false;
    this.state.tokenListings.delete(listing.tokenId);
    return { ok: true, value: true };
  }

  buyNow(listingId: number): Result<boolean> {
    const listing = this.state.listings.get(listingId);
    if (!listing || !listing.active)
      return { ok: false, value: ERR_LISTING_NOT_FOUND };
    if (this.blockHeight >= listing.expiry)
      return { ok: false, value: ERR_LISTING_EXPIRED };
    if (!this.state.marketplaceActive)
      return { ok: false, value: ERR_Marketplace_CLOSED };
    const fee = Math.floor(
      (listing.price * this.state.marketplaceFeePercent) / 10000
    );
    this.stxTransfers.push({
      amount: listing.price,
      from: this.caller,
      to: listing.seller,
    });
    this.stxTransfers.push({
      amount: fee,
      from: this.caller,
      to: this.state.marketplaceFeeRecipient,
    });
    this.mockNFTMinter.transfer(listing.tokenId, this.caller);
    listing.active = false;
    this.state.tokenListings.delete(listing.tokenId);
    return { ok: true, value: true };
  }

  placeBid(listingId: number, bidAmount: number): Result<boolean> {
    const listing = this.state.listings.get(listingId);
    if (!listing || !listing.active)
      return { ok: false, value: ERR_LISTING_NOT_FOUND };
    if (this.blockHeight >= listing.expiry)
      return { ok: false, value: ERR_LISTING_EXPIRED };
    if (!this.state.marketplaceActive)
      return { ok: false, value: ERR_Marketplace_CLOSED };
    const minNext = listing.highestBid + listing.minBidIncrement;
    if (bidAmount < minNext) return { ok: false, value: ERR_BID_TOO_LOW };
    if (this.caller === listing.seller)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (listing.highestBidder) {
      this.stxTransfers.push({
        amount: listing.highestBid,
        from: null,
        to: listing.highestBidder,
      });
    }
    this.stxTransfers.push({ amount: bidAmount, from: this.caller, to: null });
    listing.highestBid = bidAmount;
    listing.highestBidder = this.caller;
    this.state.userBids.set(`${listing.tokenId}-${this.caller}`, bidAmount);
    return { ok: true, value: true };
  }

  acceptBid(listingId: number): Result<boolean> {
    const listing = this.state.listings.get(listingId);
    if (!listing || !listing.active)
      return { ok: false, value: ERR_LISTING_NOT_FOUND };
    if (listing.seller !== this.caller)
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!listing.highestBidder) return { ok: false, value: ERR_BID_NOT_FOUND };
    if (!this.state.marketplaceActive)
      return { ok: false, value: ERR_Marketplace_CLOSED };
    const fee = Math.floor(
      (listing.highestBid * this.state.marketplaceFeePercent) / 10000
    );
    this.stxTransfers.push({
      amount: listing.highestBid - fee,
      from: null,
      to: listing.seller,
    });
    this.stxTransfers.push({
      amount: fee,
      from: null,
      to: this.state.marketplaceFeeRecipient,
    });
    this.mockNFTMinter.transfer(listing.tokenId, listing.highestBidder);
    listing.active = false;
    this.state.tokenListings.delete(listing.tokenId);
    this.state.userBids.delete(`${listing.tokenId}-${listing.highestBidder}`);
    return { ok: true, value: true };
  }

  mockNFTMinter = {
    owners: new Map<number, string>([[1, "ST1SELLER"]]),
    isOwner: (tokenId: number, user: string) =>
      this.mockNFTMinter.owners.get(tokenId) === user,
    transfer: (tokenId: number, to: string) =>
      this.mockNFTMinter.owners.set(tokenId, to),
    nftGetOwner: (tokenId: number) =>
      this.mockNFTMinter.owners.get(tokenId) || null,
  };
}

describe("NFTMarketplace", () => {
  let contract: NFTMarketplaceMock;

  beforeEach(() => {
    contract = new NFTMarketplaceMock();
    contract.reset();
  });

  it("lists NFT for sale successfully", () => {
    const result = contract.listNft(1, 1000, 50, 100);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const listing = contract.getListing(0);
    expect(listing?.price).toBe(1000);
    expect(listing?.active).toBe(true);
  });

  it("rejects listing if already listed", () => {
    contract.listNft(1, 1000, 50, 100);
    const result = contract.listNft(1, 2000, 50, 100);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ALREADY_LISTED);
  });

  it("buys NFT with buy-now successfully", () => {
    contract.listNft(1, 1000, 50, 100);
    contract.caller = "ST1BUYER";
    const result = contract.buyNow(0);
    expect(result.ok).toBe(true);
    expect(contract.stxTransfers.length).toBe(2);
    expect(contract.stxTransfers[0].amount).toBe(1000);
    expect(contract.stxTransfers[1].amount).toBe(25);
    expect(contract.mockNFTMinter.owners.get(1)).toBe("ST1BUYER");
  });

  it("places bid successfully", () => {
    contract.listNft(1, 1000, 50, 100);
    contract.caller = "ST1BIDDER";
    const result = contract.placeBid(0, 1100);
    expect(result.ok).toBe(true);
    const listing = contract.getListing(0);
    expect(listing?.highestBid).toBe(1100);
    expect(listing?.highestBidder).toBe("ST1BIDDER");
  });

  it("cancels listing successfully", () => {
    contract.listNft(1, 1000, 50, 100);
    const result = contract.cancelListing(0);
    expect(result.ok).toBe(true);
    const listing = contract.getListing(0);
    expect(listing?.active).toBe(false);
  });

  it("rejects cancel by non-seller", () => {
    contract.listNft(1, 1000, 50, 100);
    contract.caller = "ST1HACKER";
    const result = contract.cancelListing(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("toggles marketplace on/off", () => {
    contract.caller = "ST1FEE";
    contract.toggleMarketplace(false);
    expect(contract.state.marketplaceActive).toBe(false);
    const result = contract.listNft(1, 1000, 50, 100);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_Marketplace_CLOSED);
  });
});
