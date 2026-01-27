# MidSwap - MidEvils NFT Swap Escrow Program

A Solana program for trustless P2P NFT swaps between MidEvils NFT holders.

## Overview

MidSwap enables users to create and execute peer-to-peer NFT trades with on-chain escrow. The program supports:

- NFT to NFT swaps (1:1, many:many)
- NFT + SOL to NFT swaps
- Pure SOL to NFT trades
- Up to 5 NFTs per side of trade
- 0.01 SOL platform fee (collected on accept)

## Instructions

### `create_offer`
Creates a new swap offer and initializes the escrow PDA.

### `escrow_initiator_nft`
Transfers an NFT from the initiator to the escrow account.

### `accept_offer`
Accepts the offer and collects the platform fee.

### `transfer_initiator_nft_to_receiver`
Transfers escrowed NFTs from initiator to receiver (post-accept).

### `transfer_receiver_nft_to_initiator`
Transfers NFTs from receiver to initiator (post-accept).

### `cancel_offer`
Cancels a pending offer.

### `return_escrowed_nft`
Returns escrowed NFTs to initiator (post-cancel).

## Build

```bash
anchor build
```

## Deploy

```bash
# Devnet
anchor deploy --provider.cluster devnet

# Mainnet
anchor deploy --provider.cluster mainnet
```

## Test

```bash
anchor test
```

## Security Considerations

- All trades are atomic - either complete or rolled back
- Only the initiator can cancel an offer
- Only the receiver can accept an offer
- NFTs are held in escrow until trade completes
- Collection validation ensures only MidEvils NFTs can be traded
- Platform fee prevents spam

## License

MIT
