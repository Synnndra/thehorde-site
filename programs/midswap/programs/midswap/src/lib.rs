use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

// MidEvils Collection Address
pub const MIDEVIL_COLLECTION: &str = "w44WvLKRdLGye2ghhDJBxcmnWpBo31A1tCBko2G6DgW";

// Platform fee: 0.01 SOL in lamports
pub const PLATFORM_FEE: u64 = 10_000_000;

// Maximum NFTs per side of trade
pub const MAX_NFTS_PER_SIDE: usize = 5;

#[program]
pub mod midswap {
    use super::*;

    /// Create a new swap offer and escrow the initiator's NFTs
    pub fn create_offer(
        ctx: Context<CreateOffer>,
        offer_id: String,
        initiator_sol: u64,
        receiver_sol: u64,
    ) -> Result<()> {
        let offer = &mut ctx.accounts.offer;
        let clock = Clock::get()?;

        // Initialize offer
        offer.initiator = ctx.accounts.initiator.key();
        offer.receiver = ctx.accounts.receiver.key();
        offer.offer_id = offer_id;
        offer.initiator_sol = initiator_sol;
        offer.receiver_sol = receiver_sol;
        offer.status = SwapStatus::Pending;
        offer.created_at = clock.unix_timestamp;
        offer.bump = ctx.bumps.offer;

        // Transfer SOL if initiator is offering SOL
        if initiator_sol > 0 {
            let cpi_context = CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                anchor_lang::system_program::Transfer {
                    from: ctx.accounts.initiator.to_account_info(),
                    to: ctx.accounts.escrow_sol.to_account_info(),
                },
            );
            anchor_lang::system_program::transfer(cpi_context, initiator_sol)?;
        }

        emit!(OfferCreated {
            offer_id: offer.offer_id.clone(),
            initiator: offer.initiator,
            receiver: offer.receiver,
            created_at: offer.created_at,
        });

        Ok(())
    }

    /// Escrow an NFT from the initiator
    pub fn escrow_initiator_nft(ctx: Context<EscrowNft>) -> Result<()> {
        let offer = &mut ctx.accounts.offer;

        require!(
            offer.status == SwapStatus::Pending,
            SwapError::OfferNotPending
        );
        require!(
            ctx.accounts.owner.key() == offer.initiator,
            SwapError::NotInitiator
        );
        require!(
            offer.initiator_nft_count < MAX_NFTS_PER_SIDE as u8,
            SwapError::MaxNftsExceeded
        );

        // Transfer NFT to escrow
        let cpi_accounts = Transfer {
            from: ctx.accounts.nft_source.to_account_info(),
            to: ctx.accounts.nft_escrow.to_account_info(),
            authority: ctx.accounts.owner.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, 1)?;

        // Record the escrowed NFT
        offer.initiator_nfts[offer.initiator_nft_count as usize] = ctx.accounts.nft_mint.key();
        offer.initiator_nft_count += 1;

        Ok(())
    }

    /// Accept the swap offer - exchange NFTs and SOL
    pub fn accept_offer(ctx: Context<AcceptOffer>) -> Result<()> {
        let offer = &mut ctx.accounts.offer;

        require!(
            offer.status == SwapStatus::Pending,
            SwapError::OfferNotPending
        );
        require!(
            ctx.accounts.receiver.key() == offer.receiver,
            SwapError::NotReceiver
        );

        // Collect platform fee
        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.receiver.to_account_info(),
                to: ctx.accounts.fee_collector.to_account_info(),
            },
        );
        anchor_lang::system_program::transfer(cpi_context, PLATFORM_FEE)?;

        // Update status
        offer.status = SwapStatus::Accepted;
        offer.accepted_at = Some(Clock::get()?.unix_timestamp);

        emit!(OfferAccepted {
            offer_id: offer.offer_id.clone(),
            accepted_at: offer.accepted_at.unwrap(),
        });

        Ok(())
    }

    /// Transfer escrowed NFT from initiator to receiver (called after accept)
    pub fn transfer_initiator_nft_to_receiver(
        ctx: Context<TransferEscrowedNft>,
        nft_index: u8,
    ) -> Result<()> {
        let offer = &ctx.accounts.offer;

        require!(
            offer.status == SwapStatus::Accepted,
            SwapError::OfferNotAccepted
        );
        require!(
            (nft_index as usize) < offer.initiator_nft_count as usize,
            SwapError::InvalidNftIndex
        );

        let seeds = &[
            b"offer",
            offer.offer_id.as_bytes(),
            &[offer.bump],
        ];
        let signer = &[&seeds[..]];

        // Transfer NFT from escrow to receiver
        let cpi_accounts = Transfer {
            from: ctx.accounts.nft_escrow.to_account_info(),
            to: ctx.accounts.nft_destination.to_account_info(),
            authority: ctx.accounts.offer.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, 1)?;

        Ok(())
    }

    /// Transfer NFT from receiver to initiator (called after accept)
    pub fn transfer_receiver_nft_to_initiator(ctx: Context<TransferReceiverNft>) -> Result<()> {
        let offer = &ctx.accounts.offer;

        require!(
            offer.status == SwapStatus::Accepted,
            SwapError::OfferNotAccepted
        );
        require!(
            ctx.accounts.receiver.key() == offer.receiver,
            SwapError::NotReceiver
        );

        // Transfer NFT directly from receiver to initiator
        let cpi_accounts = Transfer {
            from: ctx.accounts.nft_source.to_account_info(),
            to: ctx.accounts.nft_destination.to_account_info(),
            authority: ctx.accounts.receiver.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::transfer(cpi_ctx, 1)?;

        Ok(())
    }

    /// Transfer escrowed SOL (called after accept)
    pub fn transfer_escrowed_sol(ctx: Context<TransferEscrowedSol>) -> Result<()> {
        let offer = &ctx.accounts.offer;

        require!(
            offer.status == SwapStatus::Accepted,
            SwapError::OfferNotAccepted
        );

        if offer.initiator_sol > 0 {
            // Transfer initiator's SOL to receiver
            **ctx.accounts.escrow_sol.to_account_info().try_borrow_mut_lamports()? -= offer.initiator_sol;
            **ctx.accounts.receiver.to_account_info().try_borrow_mut_lamports()? += offer.initiator_sol;
        }

        Ok(())
    }

    /// Cancel the offer and return escrowed assets
    pub fn cancel_offer(ctx: Context<CancelOffer>) -> Result<()> {
        let offer = &mut ctx.accounts.offer;

        require!(
            offer.status == SwapStatus::Pending,
            SwapError::OfferNotPending
        );
        require!(
            ctx.accounts.authority.key() == offer.initiator,
            SwapError::NotInitiator
        );

        offer.status = SwapStatus::Cancelled;
        offer.cancelled_at = Some(Clock::get()?.unix_timestamp);

        emit!(OfferCancelled {
            offer_id: offer.offer_id.clone(),
            cancelled_at: offer.cancelled_at.unwrap(),
        });

        Ok(())
    }

    /// Return escrowed NFT to initiator (called after cancel)
    pub fn return_escrowed_nft(
        ctx: Context<ReturnEscrowedNft>,
        nft_index: u8,
    ) -> Result<()> {
        let offer = &ctx.accounts.offer;

        require!(
            offer.status == SwapStatus::Cancelled,
            SwapError::OfferNotCancelled
        );
        require!(
            (nft_index as usize) < offer.initiator_nft_count as usize,
            SwapError::InvalidNftIndex
        );

        let seeds = &[
            b"offer",
            offer.offer_id.as_bytes(),
            &[offer.bump],
        ];
        let signer = &[&seeds[..]];

        // Transfer NFT from escrow back to initiator
        let cpi_accounts = Transfer {
            from: ctx.accounts.nft_escrow.to_account_info(),
            to: ctx.accounts.nft_destination.to_account_info(),
            authority: ctx.accounts.offer.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::transfer(cpi_ctx, 1)?;

        Ok(())
    }

    /// Return escrowed SOL to initiator (called after cancel)
    pub fn return_escrowed_sol(ctx: Context<ReturnEscrowedSol>) -> Result<()> {
        let offer = &ctx.accounts.offer;

        require!(
            offer.status == SwapStatus::Cancelled,
            SwapError::OfferNotCancelled
        );

        if offer.initiator_sol > 0 {
            **ctx.accounts.escrow_sol.to_account_info().try_borrow_mut_lamports()? -= offer.initiator_sol;
            **ctx.accounts.initiator.to_account_info().try_borrow_mut_lamports()? += offer.initiator_sol;
        }

        Ok(())
    }
}

// ============ Account Structures ============

#[account]
pub struct SwapOffer {
    pub initiator: Pubkey,
    pub receiver: Pubkey,
    pub offer_id: String,
    pub initiator_nfts: [Pubkey; MAX_NFTS_PER_SIDE],
    pub initiator_nft_count: u8,
    pub receiver_nfts: [Pubkey; MAX_NFTS_PER_SIDE],
    pub receiver_nft_count: u8,
    pub initiator_sol: u64,
    pub receiver_sol: u64,
    pub status: SwapStatus,
    pub created_at: i64,
    pub accepted_at: Option<i64>,
    pub cancelled_at: Option<i64>,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq)]
pub enum SwapStatus {
    Pending,
    Accepted,
    Cancelled,
    Expired,
}

// ============ Contexts ============

#[derive(Accounts)]
#[instruction(offer_id: String)]
pub struct CreateOffer<'info> {
    #[account(
        init,
        payer = initiator,
        space = 8 + 32 + 32 + 64 + (32 * MAX_NFTS_PER_SIDE) + 1 + (32 * MAX_NFTS_PER_SIDE) + 1 + 8 + 8 + 1 + 8 + 9 + 9 + 1,
        seeds = [b"offer", offer_id.as_bytes()],
        bump
    )]
    pub offer: Account<'info, SwapOffer>,

    #[account(mut)]
    pub initiator: Signer<'info>,

    /// CHECK: This is the receiver's wallet address
    pub receiver: AccountInfo<'info>,

    /// CHECK: PDA for holding escrowed SOL
    #[account(
        mut,
        seeds = [b"escrow_sol", offer_id.as_bytes()],
        bump
    )]
    pub escrow_sol: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct EscrowNft<'info> {
    #[account(mut)]
    pub offer: Account<'info, SwapOffer>,

    #[account(mut)]
    pub owner: Signer<'info>,

    /// CHECK: The NFT mint address
    pub nft_mint: AccountInfo<'info>,

    #[account(mut)]
    pub nft_source: Account<'info, TokenAccount>,

    #[account(mut)]
    pub nft_escrow: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct AcceptOffer<'info> {
    #[account(mut)]
    pub offer: Account<'info, SwapOffer>,

    #[account(mut)]
    pub receiver: Signer<'info>,

    /// CHECK: Platform fee collector
    #[account(mut)]
    pub fee_collector: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct TransferEscrowedNft<'info> {
    #[account(mut)]
    pub offer: Account<'info, SwapOffer>,

    #[account(mut)]
    pub nft_escrow: Account<'info, TokenAccount>,

    #[account(mut)]
    pub nft_destination: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct TransferReceiverNft<'info> {
    pub offer: Account<'info, SwapOffer>,

    #[account(mut)]
    pub receiver: Signer<'info>,

    #[account(mut)]
    pub nft_source: Account<'info, TokenAccount>,

    #[account(mut)]
    pub nft_destination: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct TransferEscrowedSol<'info> {
    pub offer: Account<'info, SwapOffer>,

    /// CHECK: PDA holding escrowed SOL
    #[account(mut)]
    pub escrow_sol: AccountInfo<'info>,

    /// CHECK: Receiver to receive the SOL
    #[account(mut)]
    pub receiver: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CancelOffer<'info> {
    #[account(mut)]
    pub offer: Account<'info, SwapOffer>,

    pub authority: Signer<'info>,
}

#[derive(Accounts)]
pub struct ReturnEscrowedNft<'info> {
    #[account(mut)]
    pub offer: Account<'info, SwapOffer>,

    #[account(mut)]
    pub nft_escrow: Account<'info, TokenAccount>,

    #[account(mut)]
    pub nft_destination: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ReturnEscrowedSol<'info> {
    pub offer: Account<'info, SwapOffer>,

    /// CHECK: PDA holding escrowed SOL
    #[account(mut)]
    pub escrow_sol: AccountInfo<'info>,

    /// CHECK: Initiator to receive returned SOL
    #[account(mut)]
    pub initiator: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

// ============ Events ============

#[event]
pub struct OfferCreated {
    pub offer_id: String,
    pub initiator: Pubkey,
    pub receiver: Pubkey,
    pub created_at: i64,
}

#[event]
pub struct OfferAccepted {
    pub offer_id: String,
    pub accepted_at: i64,
}

#[event]
pub struct OfferCancelled {
    pub offer_id: String,
    pub cancelled_at: i64,
}

// ============ Errors ============

#[error_code]
pub enum SwapError {
    #[msg("Offer is not in pending status")]
    OfferNotPending,

    #[msg("Offer is not in accepted status")]
    OfferNotAccepted,

    #[msg("Offer is not in cancelled status")]
    OfferNotCancelled,

    #[msg("Only the initiator can perform this action")]
    NotInitiator,

    #[msg("Only the receiver can perform this action")]
    NotReceiver,

    #[msg("Maximum NFTs per side exceeded")]
    MaxNftsExceeded,

    #[msg("Invalid NFT index")]
    InvalidNftIndex,

    #[msg("NFT is not from the MidEvils collection")]
    InvalidCollection,

    #[msg("Offer has expired")]
    OfferExpired,
}
