import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { WsConfidentialPrimaryMarketAuction } from "../target/types/ws_confidential_primary_market_auction";
import { randomBytes } from "crypto";
import {
  awaitComputationFinalization,
  getArciumEnv,
  getCompDefAccOffset,
  getArciumAccountBaseSeed,
  getArciumProgramId,
  uploadCircuit,
  buildFinalizeCompDefTx,
  RescueCipher,
  deserializeLE,
  getMXEPublicKey,
  getMXEAccAddress,
  getMempoolAccAddress,
  getCompDefAccAddress,
  getExecutingPoolAccAddress,
  getComputationAccAddress,
  getClusterAccAddress,
  x25519,
} from "@arcium-hq/client";
import * as fs from "fs";
import * as os from "os";
import { expect } from "chai";

// Cluster configuration
// For localnet testing: null (uses ARCIUM_CLUSTER_PUBKEY from env)
// For devnet/testnet: specific cluster offset
const CLUSTER_OFFSET: number | null = null;

/**
 * Gets the cluster account address based on configuration.
 * - If CLUSTER_OFFSET is set: Uses getClusterAccAddress (devnet/testnet)
 * - If null: Uses getArciumEnv().arciumClusterOffset (localnet)
 */
function getClusterAccount(): PublicKey {
  const offset = CLUSTER_OFFSET ?? getArciumEnv().arciumClusterOffset;
  return getClusterAccAddress(offset);
}

describe("WsConfidentialPrimaryMarketAuction", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.AnchorProvider.env());
  const program = anchor.workspace
    .WsConfidentialPrimaryMarketAuction as Program<WsConfidentialPrimaryMarketAuction>;
  const provider = anchor.getProvider();

  type Event = anchor.IdlEvents<(typeof program)["idl"]>;
  const awaitEvent = async <E extends keyof Event>(
    eventName: E,
  ): Promise<Event[E]> => {
    let listenerId: number;
    const event = await new Promise<Event[E]>((res) => {
      listenerId = program.addEventListener(eventName, (event) => {
        res(event);
      });
    });
    await program.removeEventListener(listenerId);

    return event;
  };

  const arciumEnv = getArciumEnv();
  const clusterAccount = getClusterAccount();
let owner: anchor.web3.Keypair;
let mxePublicKey: Uint8Array;
let compDefsInitialized = false;
before(async () => {
    owner = readKpJson(`/Users/air/.config/solana/local.json`);


    mxePublicKey = await getMXEPublicKeyWithRetry(
      provider as anchor.AnchorProvider,
      program.programId,
    );

    console.log("MXE x25519 pubkey is", mxePublicKey);

    if (!compDefsInitialized) {
      console.log("\n=== Initializing Computation Definitions ===\n");

      console.log("1. Initializing init_auction_state comp def...");
      await initCompDef(program, owner, "init_auction_state");
      console.log("   Done.");

      console.log("2. Initializing place_bid comp def...");
      await initCompDef(program, owner, "place_bid");
      console.log("   Done.");

      console.log("3. Initializing first_winner comp def...");
      await initCompDef(program, owner, "first_winner");
      console.log("   Done.");

      console.log("4. Initializing second_winner comp def...");
      await initCompDef(program, owner, "second_winner");
      console.log("   Done.\n");

      compDefsInitialized = true;
    }

  });
  describe("First Price Auction", () => {
    it("creates an auction, accepts bids, and determines winner (pays their bid)", async () => {
      const bidder = owner;
      const bidderPubkey = bidder.publicKey.toBytes();
      const { lo: bidderLo, hi: bidderHi } = splitPubkeyToU128s(bidderPubkey);
      const privateKey = x25519.utils.randomSecretKey();
      const publicKey = x25519.getPublicKey(privateKey);
      const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
      const cipher = new RescueCipher(sharedSecret);
      const auctionCreatedPromise = awaitEvent("auctionCreatedEvent");
      const createComputationOffset = new anchor.BN(randomBytes(8), "hex");

      const [auctionPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("auction"), owner.publicKey.toBuffer()],
        program.programId
      );
      const createNonce = randomBytes(16);
      const createSig = await program.methods
        .initAuctionState(
          createComputationOffset,
          { firstPrice: {} }, // AuctionType::FirstPrice
          new anchor.BN(100), // min_bid: 100 lamports
          new anchor.BN(Date.now() / 1000 + 3600), // end_time: 1 hour from now
          new anchor.BN(deserializeLE(createNonce).toString()) // nonce for MXE
        )
        .accountsPartial({
          authority: owner.publicKey,
          auction: auctionPDA,
          computationAccount: getComputationAccAddress(
            arciumEnv.arciumClusterOffset,
            createComputationOffset
          ),
          clusterAccount,
          mxeAccount: getMXEAccAddress(program.programId),
          mempoolAccount: getMempoolAccAddress(arciumEnv.arciumClusterOffset),
          executingPool: getExecutingPoolAccAddress(
            arciumEnv.arciumClusterOffset
          ),
          compDefAccount: getCompDefAccAddress(
            program.programId,
            Buffer.from(
              getCompDefAccOffset("init_auction_state")
            ).readUInt32LE()
          ),
        })
        .rpc({ skipPreflight: true, commitment: "confirmed" });
        console.log("   Create auction tx:", createSig);
        const createFinalizeSig = await awaitComputationFinalization(
          provider as anchor.AnchorProvider,
          createComputationOffset,
          program.programId,
          "confirmed"
        );
        console.log("   Finalize tx:", createFinalizeSig);
        const auctionCreatedEvent = await auctionCreatedPromise;
        console.log(
          "   Auction created:",
          auctionCreatedEvent.auction.toBase58()
        );
        expect(auctionCreatedEvent.minBid.toNumber()).to.equal(100);
        const bidPlacedPromise = awaitEvent("bidPlacedEvent");
      const bidComputationOffset = new anchor.BN(randomBytes(8), "hex");
      const bidAmount = BigInt(500);
      const nonce = randomBytes(16);
      const bidPlaintext = [bidderLo, bidderHi, bidAmount];
      const bidCiphertext = cipher.encrypt(bidPlaintext, nonce);
      const placeBidSig = await program.methods
        .placeBid(
          bidComputationOffset,
          Array.from(bidCiphertext[0]), // encrypted_bidder_lo
          Array.from(bidCiphertext[1]), // encrypted_bidder_hi
          Array.from(bidCiphertext[2]), // encrypted_amount
          Array.from(publicKey),
          new anchor.BN(deserializeLE(nonce).toString())
        )
        .accountsPartial({
          bidder: bidder.publicKey,
          auction: auctionPDA,
          computationAccount: getComputationAccAddress(
            arciumEnv.arciumClusterOffset,
            bidComputationOffset
          ),
          clusterAccount,
          mxeAccount: getMXEAccAddress(program.programId),
          mempoolAccount: getMempoolAccAddress(arciumEnv.arciumClusterOffset),
          executingPool: getExecutingPoolAccAddress(
            arciumEnv.arciumClusterOffset
          ),
          compDefAccount: getCompDefAccAddress(
            program.programId,
            Buffer.from(getCompDefAccOffset("place_bid")).readUInt32LE()
          ),
        })
        .rpc({ skipPreflight: true, commitment: "confirmed" });

      console.log("   Place bid tx:", placeBidSig);
      const bidFinalizeSig = await awaitComputationFinalization(
        provider as anchor.AnchorProvider,
        bidComputationOffset,
        program.programId,
        "confirmed"
      );
      console.log("   Finalize tx:", bidFinalizeSig);
      const bidPlacedEvent = await bidPlacedPromise;
      console.log("   Bid placed, count:", bidPlacedEvent.bidCount);
      expect(bidPlacedEvent.bidCount).to.equal(1);
      console.log("\nStep 3: Closing auction...");
      const auctionClosedPromise = awaitEvent("auctionClosedEvent");

      const closeSig = await program.methods
        .closeAuction()
        .accountsPartial({
          authority: owner.publicKey,
          auction: auctionPDA,
        })
        .rpc({ commitment: "confirmed" });

      console.log("   Close auction tx:", closeSig);

      const auctionClosedEvent = await auctionClosedPromise;
      console.log("   Auction closed, bid count:", auctionClosedEvent.bidCount);
      console.log("\nStep 4: Determining first winner...");
      const auctionResolvedPromise = awaitEvent("auctionResolvedEvent");
      const resolveComputationOffset = new anchor.BN(randomBytes(8), "hex");
      const resolveSig = await program.methods
      .firstWinner(resolveComputationOffset)
      .accountsPartial({
        authority: owner.publicKey,
        auction: auctionPDA,
        computationAccount: getComputationAccAddress(
          arciumEnv.arciumClusterOffset,
          resolveComputationOffset
        ),
        clusterAccount,
        mxeAccount: getMXEAccAddress(program.programId),
        mempoolAccount: getMempoolAccAddress(arciumEnv.arciumClusterOffset),
        executingPool: getExecutingPoolAccAddress(
          arciumEnv.arciumClusterOffset
        ),
        compDefAccount: getCompDefAccAddress(
          program.programId,
          Buffer.from(
            getCompDefAccOffset("determine_winner_first_price")
          ).readUInt32LE()
        ),
      })
      .rpc({ skipPreflight: true, commitment: "confirmed" });

    console.log("   Determine winner tx:", resolveSig);
    const resolveFinalizeSig = await awaitComputationFinalization(
      provider as anchor.AnchorProvider,
      resolveComputationOffset,
      program.programId,
      "confirmed"
    );
    console.log("   Finalize tx:", resolveFinalizeSig);
    const auctionResolvedEvent = await auctionResolvedPromise;
      console.log("\n=== First-Price Auction Results ===");
      console.log(
        "   Winner pubkey (bytes):",
        Buffer.from(auctionResolvedEvent.winner).toString("hex")
      );
      console.log(
        "   Payment amount:",
        auctionResolvedEvent.paymentAmount.toNumber(),
        "lamports"
      );

      // Verify: In first-price, winner pays their bid (500)
      expect(auctionResolvedEvent.paymentAmount.toNumber()).to.equal(500);

      // Verify winner matches bidder
      const expectedWinner = Buffer.from(bidderPubkey).toString("hex");
      const actualWinner = Buffer.from(auctionResolvedEvent.winner).toString(
        "hex"
      );
      expect(actualWinner).to.equal(expectedWinner);

      console.log("\n   First-price auction test PASSED!");

    });
  });
  async function initCompDef(
    program: Program<WsConfidentialPrimaryMarketAuction>,
    owner: anchor.web3.Keypair,
    circuitName: string
  ): Promise<string> {
    const baseSeedCompDefAcc = getArciumAccountBaseSeed(
      "ComputationDefinitionAccount"
    );
    const offset = getCompDefAccOffset(circuitName);
    const compDefPDA = PublicKey.findProgramAddressSync(
      [baseSeedCompDefAcc, program.programId.toBuffer(), offset],
      getArciumProgramId()
    )[0];
    let tx: string;
    switch (circuitName) {
      case "init_auction_state":
        tx = await program.methods
          .initAuctionStateCompDef()
          .accounts({
            compDefAccount: compDefPDA,
            payer: owner.publicKey,
            mxeAccount: getMXEAccAddress(program.programId),
          })
          .signers([owner])
          .rpc({ preflightCommitment: "confirmed" });
        break;
      case "place_bid":
        tx = await program.methods
          .initPlaceBidCompDef()
          .accounts({
            compDefAccount: compDefPDA,
            payer: owner.publicKey,
            mxeAccount: getMXEAccAddress(program.programId),
          })
          .signers([owner])
          .rpc({ preflightCommitment: "confirmed" });
        break;
      case "first_winner":
        tx = await program.methods
          .initFirstWinnerCompDef()
          .accounts({
            compDefAccount: compDefPDA,
            payer: owner.publicKey,
            mxeAccount: getMXEAccAddress(program.programId),
          })
          .signers([owner])
          .rpc({ preflightCommitment: "confirmed" });
        break;
      case "second_winner":
          tx = await program.methods
            .initSecondWinnerCompDef()
          .accounts({
            compDefAccount: compDefPDA,
            payer: owner.publicKey,
            mxeAccount: getMXEAccAddress(program.programId),
          })
          .signers([owner])
          .rpc({ preflightCommitment: "confirmed" });
        break;
      default:
        throw new Error(`Unknown circuit: ${circuitName}`);
    }
    const finalizeTx = await buildFinalizeCompDefTx(
      provider as anchor.AnchorProvider,
      Buffer.from(offset).readUInt32LE(),
      program.programId
    );
  
    const latestBlockhash = await provider.connection.getLatestBlockhash();
    finalizeTx.recentBlockhash = latestBlockhash.blockhash;
    finalizeTx.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;
  
    finalizeTx.sign(owner);
  
    await provider.sendAndConfirm(finalizeTx);
  
    return tx;
  }
});
function splitPubkeyToU128s(pubkey: Uint8Array): { lo: bigint; hi: bigint } {
  // Lower 128 bits (first 16 bytes)
  const loBytes = pubkey.slice(0, 16);
  // Upper 128 bits (last 16 bytes)
  const hiBytes = pubkey.slice(16, 32);

  // Convert to bigint (little-endian)
  const lo = deserializeLE(loBytes);
  const hi = deserializeLE(hiBytes);

  return { lo, hi };
}

async function getMXEPublicKeyWithRetry(
  provider: anchor.AnchorProvider,
  programId: PublicKey,
  maxRetries: number = 20,
  retryDelayMs: number = 500,
): Promise<Uint8Array> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const mxePublicKey = await getMXEPublicKey(provider, programId);
      if (mxePublicKey) {
        return mxePublicKey;
      }
    } catch (error) {
      console.log(`Attempt ${attempt} failed to fetch MXE public key:`, error);
    }

    if (attempt < maxRetries) {
      console.log(
        `Retrying in ${retryDelayMs}ms... (attempt ${attempt}/${maxRetries})`,
      );
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  throw new Error(
    `Failed to fetch MXE public key after ${maxRetries} attempts`,
  );
}

function readKpJson(path: string): anchor.web3.Keypair {
  const file = fs.readFileSync(path);
  return anchor.web3.Keypair.fromSecretKey(
    new Uint8Array(JSON.parse(file.toString())),
  );
}
