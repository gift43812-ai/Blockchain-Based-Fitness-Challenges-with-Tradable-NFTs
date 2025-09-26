import { describe, it, expect, beforeEach } from "vitest";
import { stringAsciiCV, uintCV, buffCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_CHALLENGE_NOT_FOUND = 101;
const ERR_CHALLENGE_EXPIRED = 102;
const ERR_ALREADY_JOINED = 103;
const ERR_NOT_JOINED = 104;
const ERR_INVALID_TITLE = 105;
const ERR_INVALID_DESCRIPTION = 106;
const ERR_INVALID_DURATION = 107;
const ERR_INVALID_STAKE = 108;
const ERR_INVALID_REWARD = 109;
const ERR_INVALID_MIN_PARTICIPANTS = 110;
const ERR_CHALLENGE_NOT_ACTIVE = 111;
const ERR_INVALID_START_TIME = 112;
const ERR_INVALID_PROOF = 113;
const ERR_PROOF_ALREADY_SUBMITTED = 114;
const ERR_CHALLENGE_FULL = 115;
const ERR_INVALID_MAX_PARTICIPANTS = 116;
const ERR_INVALID_DIFFICULTY = 117;
const ERR_INVALID_CATEGORY = 118;
const ERR_MAX_CHALLENGES_EXCEEDED = 119;
const ERR_INVALID_STATUS = 120;
const ERR_STAKE_NOT_MET = 121;
const ERR_REWARD_DISTRIBUTION_FAILED = 122;
const ERR_INVALID_CREATOR = 123;
const ERR_INVALID_PARTICIPANT = 124;
const ERR_EARLY_SUBMISSION = 125;

interface Challenge {
  title: string;
  description: string;
  creator: string;
  startTime: number;
  endTime: number;
  stakeAmount: number;
  rewardPool: number;
  minParticipants: number;
  maxParticipants: number;
  currentParticipants: number;
  active: boolean;
  difficulty: number;
  category: string;
  status: string;
}

interface UserChallenge {
  joined: boolean;
  stakePaid: number;
  proofSubmitted: boolean;
  completed: boolean;
}

interface ChallengeProof {
  proofHash: Uint8Array;
  submissionTime: number;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class ChallengeManagerMock {
  state: {
    challengeCounter: number;
    maxChallenges: number;
    creationFee: number;
    authorityContract: string | null;
    challenges: Map<number, Challenge>;
    userChallenges: Map<string, UserChallenge>;
    challengeProofs: Map<string, ChallengeProof>;
    challengesByTitle: Map<string, number>;
  } = {
    challengeCounter: 0,
    maxChallenges: 1000,
    creationFee: 500,
    authorityContract: null,
    challenges: new Map(),
    userChallenges: new Map(),
    challengeProofs: new Map(),
    challengesByTitle: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      challengeCounter: 0,
      maxChallenges: 1000,
      creationFee: 500,
      authorityContract: null,
      challenges: new Map(),
      userChallenges: new Map(),
      challengeProofs: new Map(),
      challengesByTitle: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.stxTransfers = [];
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (this.state.authorityContract !== null) {
      return { ok: false, value: ERR_NOT_AUTHORIZED };
    }
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setMaxChallenges(newMax: number): Result<boolean> {
    if (newMax <= 0) return { ok: false, value: ERR_INVALID_MAX_PARTICIPANTS };
    if (!this.state.authorityContract) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.maxChallenges = newMax;
    return { ok: true, value: true };
  }

  setCreationFee(newFee: number): Result<boolean> {
    if (newFee < 0) return { ok: false, value: ERR_INVALID_STAKE };
    if (!this.state.authorityContract) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.state.creationFee = newFee;
    return { ok: true, value: true };
  }

  createChallenge(
    title: string,
    description: string,
    duration: number,
    stakeAmount: number,
    reward: number,
    minParticipants: number,
    maxParticipants: number,
    difficulty: number,
    category: string
  ): Result<number> {
    if (this.state.challengeCounter >= this.state.maxChallenges) return { ok: false, value: ERR_MAX_CHALLENGES_EXCEEDED };
    if (!title || title.length > 100) return { ok: false, value: ERR_INVALID_TITLE };
    if (!description || description.length > 500) return { ok: false, value: ERR_INVALID_DESCRIPTION };
    if (duration <= 0) return { ok: false, value: ERR_INVALID_DURATION };
    if (stakeAmount < 0) return { ok: false, value: ERR_INVALID_STAKE };
    if (reward < 0) return { ok: false, value: ERR_INVALID_REWARD };
    if (minParticipants <= 0) return { ok: false, value: ERR_INVALID_MIN_PARTICIPANTS };
    if (maxParticipants <= 0) return { ok: false, value: ERR_INVALID_MAX_PARTICIPANTS };
    if (difficulty < 1 || difficulty > 10) return { ok: false, value: ERR_INVALID_DIFFICULTY };
    if (!["running", "strength", "endurance"].includes(category)) return { ok: false, value: ERR_INVALID_CATEGORY };
    if (this.state.blockHeight < this.blockHeight) return { ok: false, value: ERR_INVALID_START_TIME };
    if (this.state.challengesByTitle.has(title)) return { ok: false, value: ERR_CHALLENGE_NOT_FOUND };
    if (!this.state.authorityContract) return { ok: false, value: ERR_NOT_AUTHORIZED };
    this.stxTransfers.push({ amount: this.state.creationFee, from: this.caller, to: this.state.authorityContract });
    const id = this.state.challengeCounter;
    const challenge: Challenge = {
      title,
      description,
      creator: this.caller,
      startTime: this.blockHeight,
      endTime: this.blockHeight + duration,
      stakeAmount,
      rewardPool: reward,
      minParticipants,
      maxParticipants,
      currentParticipants: 0,
      active: true,
      difficulty,
      category,
      status: "open",
    };
    this.state.challenges.set(id, challenge);
    this.state.challengesByTitle.set(title, id);
    this.state.challengeCounter++;
    return { ok: true, value: id };
  }

  getChallenge(id: number): Challenge | null {
    return this.state.challenges.get(id) || null;
  }

  joinChallenge(challengeId: number, stake: number): Result<boolean> {
    const challenge = this.state.challenges.get(challengeId);
    if (!challenge) return { ok: false, value: ERR_CHALLENGE_NOT_FOUND };
    if (!challenge.active) return { ok: false, value: ERR_CHALLENGE_NOT_ACTIVE };
    if (this.blockHeight >= challenge.endTime) return { ok: false, value: ERR_CHALLENGE_EXPIRED };
    if (stake < challenge.stakeAmount) return { ok: false, value: ERR_STAKE_NOT_MET };
    if (challenge.currentParticipants >= challenge.maxParticipants) return { ok: false, value: ERR_CHALLENGE_FULL };
    const userKey = `${this.caller}-${challengeId}`;
    const userStatus = this.state.userChallenges.get(userKey) || { joined: false, stakePaid: 0, proofSubmitted: false, completed: false };
    if (userStatus.joined) return { ok: false, value: ERR_ALREADY_JOINED };
    this.stxTransfers.push({ amount: stake, from: this.caller, to: null });
    this.state.userChallenges.set(userKey, { joined: true, stakePaid: stake, proofSubmitted: false, completed: false });
    challenge.currentParticipants++;
    challenge.rewardPool += stake;
    return { ok: true, value: true };
  }

  submitProof(challengeId: number, proofHash: Uint8Array): Result<boolean> {
    const challenge = this.state.challenges.get(challengeId);
    if (!challenge) return { ok: false, value: ERR_CHALLENGE_NOT_FOUND };
    if (!challenge.active) return { ok: false, value: ERR_CHALLENGE_NOT_ACTIVE };
    if (this.blockHeight < challenge.startTime) return { ok: false, value: ERR_EARLY_SUBMISSION };
    if (this.blockHeight >= challenge.endTime) return { ok: false, value: ERR_CHALLENGE_EXPIRED };
    const userKey = `${this.caller}-${challengeId}`;
    const userStatus = this.state.userChallenges.get(userKey);
    if (!userStatus || !userStatus.joined) return { ok: false, value: ERR_NOT_JOINED };
    if (userStatus.proofSubmitted) return { ok: false, value: ERR_PROOF_ALREADY_SUBMITTED };
    const proofKey = `${challengeId}-${this.caller}`;
    this.state.challengeProofs.set(proofKey, { proofHash, submissionTime: this.blockHeight });
    userStatus.proofSubmitted = true;
    userStatus.completed = true;
    return { ok: true, value: true };
  }

  deactivateChallenge(challengeId: number): Result<boolean> {
    const challenge = this.state.challenges.get(challengeId);
    if (!challenge) return { ok: false, value: ERR_CHALLENGE_NOT_FOUND };
    if (challenge.creator !== this.caller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (!challenge.active) return { ok: false, value: ERR_CHALLENGE_NOT_ACTIVE };
    challenge.active = false;
    challenge.status = "deactivated";
    return { ok: true, value: true };
  }

  getChallengeCount(): Result<number> {
    return { ok: true, value: this.state.challengeCounter };
  }

  checkChallengeExistence(title: string): Result<boolean> {
    return { ok: true, value: this.state.challengesByTitle.has(title) };
  }
}

describe("ChallengeManager", () => {
  let contract: ChallengeManagerMock;
  beforeEach(() => {
    contract = new ChallengeManagerMock();
    contract.reset();
  });

  it("creates a challenge successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.createChallenge(
      "Run 5km",
      "Daily run challenge",
      7,
      100,
      500,
      5,
      50,
      3,
      "running"
    );
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const challenge = contract.getChallenge(0);
    expect(challenge?.title).toBe("Run 5km");
    expect(challenge?.description).toBe("Daily run challenge");
    expect(challenge?.stakeAmount).toBe(100);
    expect(challenge?.rewardPool).toBe(500);
    expect(challenge?.minParticipants).toBe(5);
    expect(challenge?.maxParticipants).toBe(50);
    expect(challenge?.difficulty).toBe(3);
    expect(challenge?.category).toBe("running");
    expect(contract.stxTransfers).toEqual([{ amount: 500, from: "ST1TEST", to: "ST2TEST" }]);
  });

  it("rejects duplicate challenge titles", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.createChallenge(
      "Run 5km",
      "Daily run challenge",
      7,
      100,
      500,
      5,
      50,
      3,
      "running"
    );
    const result = contract.createChallenge(
      "Run 5km",
      "Another description",
      14,
      200,
      1000,
      10,
      100,
      5,
      "strength"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_CHALLENGE_NOT_FOUND);
  });

  it("joins a challenge successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.createChallenge(
      "Run 5km",
      "Daily run challenge",
      7,
      100,
      500,
      5,
      50,
      3,
      "running"
    );
    contract.blockHeight = 1;
    const result = contract.joinChallenge(0, 100);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const challenge = contract.getChallenge(0);
    expect(challenge?.currentParticipants).toBe(1);
    expect(challenge?.rewardPool).toBe(600);
    expect(contract.stxTransfers.length).toBe(2);
  });

  it("rejects joining expired challenge", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.createChallenge(
      "Run 5km",
      "Daily run challenge",
      7,
      100,
      500,
      5,
      50,
      3,
      "running"
    );
    contract.blockHeight = 8;
    const result = contract.joinChallenge(0, 100);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_CHALLENGE_EXPIRED);
  });

  it("submits proof successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.createChallenge(
      "Run 5km",
      "Daily run challenge",
      7,
      100,
      500,
      5,
      50,
      3,
      "running"
    );
    contract.joinChallenge(0, 100);
    contract.blockHeight = 2;
    const proofHash = new Uint8Array(32);
    const result = contract.submitProof(0, proofHash);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const userKey = `${contract.caller}-0`;
    const userStatus = contract.state.userChallenges.get(userKey);
    expect(userStatus?.proofSubmitted).toBe(true);
    expect(userStatus?.completed).toBe(true);
  });

  it("rejects proof submission before start", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.createChallenge(
      "Run 5km",
      "Daily run challenge",
      7,
      100,
      500,
      5,
      50,
      3,
      "running"
    );
    contract.joinChallenge(0, 100);
    contract.blockHeight = -1;
    const proofHash = new Uint8Array(32);
    const result = contract.submitProof(0, proofHash);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_EARLY_SUBMISSION);
  });

  it("deactivates challenge successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.createChallenge(
      "Run 5km",
      "Daily run challenge",
      7,
      100,
      500,
      5,
      50,
      3,
      "running"
    );
    const result = contract.deactivateChallenge(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const challenge = contract.getChallenge(0);
    expect(challenge?.active).toBe(false);
    expect(challenge?.status).toBe("deactivated");
  });

  it("rejects deactivation by non-creator", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.createChallenge(
      "Run 5km",
      "Daily run challenge",
      7,
      100,
      500,
      5,
      50,
      3,
      "running"
    );
    contract.caller = "ST3FAKE";
    const result = contract.deactivateChallenge(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("returns correct challenge count", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.createChallenge(
      "Run 5km",
      "Daily run challenge",
      7,
      100,
      500,
      5,
      50,
      3,
      "running"
    );
    contract.createChallenge(
      "Pushups",
      "Strength challenge",
      14,
      200,
      1000,
      10,
      100,
      5,
      "strength"
    );
    const result = contract.getChallengeCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("checks challenge existence correctly", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.createChallenge(
      "Run 5km",
      "Daily run challenge",
      7,
      100,
      500,
      5,
      50,
      3,
      "running"
    );
    const result = contract.checkChallengeExistence("Run 5km");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const result2 = contract.checkChallengeExistence("NonExistent");
    expect(result2.ok).toBe(true);
    expect(result2.value).toBe(false);
  });

  it("rejects challenge creation with invalid duration", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.createChallenge(
      "Invalid",
      "Desc",
      0,
      100,
      500,
      5,
      50,
      3,
      "running"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_DURATION);
  });

  it("rejects challenge creation with max challenges exceeded", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.state.maxChallenges = 1;
    contract.createChallenge(
      "Run 5km",
      "Daily run challenge",
      7,
      100,
      500,
      5,
      50,
      3,
      "running"
    );
    const result = contract.createChallenge(
      "Pushups",
      "Strength challenge",
      14,
      200,
      1000,
      10,
      100,
      5,
      "strength"
    );
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_CHALLENGES_EXCEEDED);
  });

  it("sets authority contract successfully", () => {
    const result = contract.setAuthorityContract("ST2TEST");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.authorityContract).toBe("ST2TEST");
  });
});