# Confidential Primary Market Auction

This project implements a confidential primary market auction system on Solana using Arcium's confidential computing framework. The auction supports both first-price and second-price (Vickrey) auction mechanisms while keeping bid amounts and bidder identities confidential until the auction is resolved.

## Project Structure

This project follows a similar structure to a standard Solana Anchor project, with one key difference: there are two distinct places where code is written:

- **The `programs` directory**: Contains the standard Solana Anchor program code that handles on-chain state management, account validation, and instruction processing.

- **The `encrypted-ixs` directory**: Contains confidential computing instructions written using Arcis, Arcium's Rust-based framework for defining operations that execute in a confidential computing environment.

## How It Works

When working with plaintext data, operations are handled directly in the Solana program as usual. However, when working with confidential data (such as bid amounts and bidder identities), state transitions occur off-chain using the Arcium network as a co-processor.

For each confidential operation, the program requires two instructions:
1. **Initialization instruction**: Called to start a confidential computation, which queues the work on the Arcium network.
2. **Callback instruction**: Called when the computation completes, receiving the encrypted results and updating the on-chain state accordingly.

The Arcium framework provides macros that automatically handle the correct accounts and data passing for these initialization and callback functions, ensuring proper integration between the Solana program and the confidential computing environment.

## Auction Features

### Auction Types
- **First-Price Auction**: The winner pays their bid amount
- **Second-Price Auction (Vickrey)**: The winner pays the second-highest bid amount

### Auction Lifecycle
1. **Open**: The auction is accepting bids
2. **Closed**: The auction has ended and is no longer accepting bids
3. **Resolved**: The winner has been determined and the auction is complete

### Confidential Operations

The following operations are performed confidentially using the Arcium network:

- **Initializing Auction State**: Sets up the encrypted auction state with initial values
- **Placing Bids**: Processes bids confidentially, updating the highest and second-highest bid information without revealing bid amounts or bidder identities
- **Determining Winners**: Computes the auction winner and payment amount based on the auction type, revealing the result only when the auction is resolved

### Key Features

- **Confidential Bidding**: Bid amounts and bidder identities remain encrypted during the auction
- **Minimum Bid Requirements**: Auctions can specify a minimum bid amount
- **Time-Limited**: Auctions have an end time after which no new bids are accepted
- **Bid Tracking**: The system tracks the total number of bids placed
- **Event Emission**: The program emits events for auction creation, bid placement, auction closure, and resolution

## Account Structure

The program manages an `Auction` account that stores:
- Auction authority and configuration (type, minimum bid, end time)
- Current auction status
- Encrypted state containing confidential bid information
- Bid count and nonce for state verification

## Error Handling

The program includes comprehensive error handling for:
- Aborted computations
- Cluster configuration issues
- Auction state validation (open/closed status)
- Auction type mismatches
- Unauthorized operations
