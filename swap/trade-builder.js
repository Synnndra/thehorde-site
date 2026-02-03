// MidEvils NFT Swap - Trade Summary & Offer Creation

function updateTradeSummary() {
    if (!elements.summaryGiving || !elements.summaryReceiving) return;

    const yourSol = parseFloat(elements.yourSolAmount?.value) || 0;
    const theirSol = parseFloat(elements.theirSolAmount?.value) || 0;

    elements.summaryGiving.innerHTML = '';
    if (selectedYourNFTs.length === 0 && yourSol === 0) {
        elements.summaryGiving.innerHTML = '<span class="placeholder">Nothing selected</span>';
    } else {
        selectedYourNFTs.forEach(nft => {
            elements.summaryGiving.appendChild(createSummaryItem(nft));
        });
        if (yourSol > 0) {
            elements.summaryGiving.appendChild(createSolSummaryItem(yourSol));
        }
    }

    elements.summaryReceiving.innerHTML = '';
    if (selectedTheirNFTs.length === 0 && theirSol === 0) {
        elements.summaryReceiving.innerHTML = '<span class="placeholder">Nothing selected</span>';
    } else {
        selectedTheirNFTs.forEach(nft => {
            elements.summaryReceiving.appendChild(createSummaryItem(nft));
        });
        if (theirSol > 0) {
            elements.summaryReceiving.appendChild(createSolSummaryItem(theirSol));
        }
    }

    updateCreateOfferButton();
}

function createSummaryItem(nft) {
    const div = document.createElement('div');
    div.className = 'summary-item';
    div.innerHTML = `
        <img src="${sanitizeImageUrl(nft.imageUrl)}" alt="${escapeHtml(nft.name)}">
        <span>${escapeHtml(nft.name)}</span>
    `;
    return div;
}

function createSolSummaryItem(amount) {
    const div = document.createElement('div');
    div.className = 'summary-item sol-item';
    div.textContent = `+ ${amount} SOL`;
    return div;
}

function updateCreateOfferButton() {
    if (!elements.createOfferBtn) return;

    const yourSol = parseFloat(elements.yourSolAmount?.value) || 0;
    const theirSol = parseFloat(elements.theirSolAmount?.value) || 0;
    const partnerWallet = elements.partnerWalletInput?.value.trim();

    const hasYourOffer = selectedYourNFTs.length > 0 || yourSol > 0;
    const hasTheirRequest = selectedTheirNFTs.length > 0 || theirSol > 0;

    const isValid = hasYourOffer && hasTheirRequest && partnerWallet && connectedWallet;

    elements.createOfferBtn.disabled = !isValid;
}

async function createOffer() {
    if (!connectedWallet) {
        showError('Please connect your wallet first');
        return;
    }

    const partnerWallet = elements.partnerWalletInput.value.trim();
    if (!partnerWallet) {
        showError('Please enter a partner wallet address');
        return;
    }

    const yourSol = parseFloat(elements.yourSolAmount?.value) || 0;
    const theirSol = parseFloat(elements.theirSolAmount?.value) || 0;

    const fee = isOrcHolder ? 0 : PLATFORM_FEE;
    const requiredSol = yourSol + fee + 0.005;
    if (solBalance < requiredSol) {
        showError(`Insufficient SOL balance. You need at least ${requiredSol.toFixed(4)} SOL (${yourSol > 0 ? yourSol + ' SOL to send + ' : ''}${fee > 0 ? fee + ' SOL fee + ' : ''}~0.005 tx fees). Your balance: ${solBalance.toFixed(4)} SOL`);
        return;
    }

    const createSteps = [
        'Check your wallet for an approval request',
        'Confirming escrow on-chain',
        'Check your wallet to sign a verification message',
        'Saving offer',
    ];
    showSteppedLoading(createSteps, 0);
    elements.createOfferBtn.disabled = true;

    let pendingEscrow = null;

    try {
        showSteppedLoading(createSteps, 0);
        const escrowResult = await escrowInitiatorAssets(selectedYourNFTs, yourSol);

        if (!escrowResult.success) {
            throw new Error(escrowResult.error || 'Failed to escrow assets');
        }

        // Save pending escrow to localStorage immediately after on-chain success
        // so we can recover if signing or the API call fails
        pendingEscrow = {
            initiatorWallet: connectedWallet,
            receiverWallet: partnerWallet,
            initiatorNfts: selectedYourNFTs.map(n => n.id),
            receiverNfts: selectedTheirNFTs.map(n => n.id),
            initiatorSol: yourSol,
            receiverSol: theirSol,
            initiatorNftDetails: selectedYourNFTs,
            receiverNftDetails: selectedTheirNFTs,
            escrowTxSignature: escrowResult.signature,
            isOrcHolder: isOrcHolder,
            savedAt: Date.now()
        };
        localStorage.setItem(`pendingEscrow:${connectedWallet}`, JSON.stringify(pendingEscrow));

        showSteppedLoading(createSteps, 1);
        await new Promise(r => setTimeout(r, 400));
        showSteppedLoading(createSteps, 2);
        const timestamp = Date.now();
        const message = `Midswap create offer from ${connectedWallet} to ${partnerWallet} at ${timestamp}`;
        let signature;
        try {
            signature = await signMessageForAuth(message);
        } catch (signErr) {
            throw new Error('Message signing cancelled or failed: ' + signErr.message);
        }

        showSteppedLoading(createSteps, 3);
        const response = await fetch('/api/swap/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                initiatorWallet: connectedWallet,
                receiverWallet: partnerWallet,
                initiatorNfts: selectedYourNFTs.map(n => n.id),
                receiverNfts: selectedTheirNFTs.map(n => n.id),
                initiatorSol: yourSol,
                receiverSol: theirSol,
                initiatorNftDetails: selectedYourNFTs,
                receiverNftDetails: selectedTheirNFTs,
                escrowTxSignature: escrowResult.signature,
                isOrcHolder: isOrcHolder,
                signature: signature,
                message: message
            })
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        localStorage.removeItem(`pendingEscrow:${connectedWallet}`);
        hideLoading();

        const offerUrl = `${window.location.origin}/swap/offer.html?id=${data.offerId}`;
        elements.offerLinkInput.value = offerUrl;
        elements.successModal.style.display = 'flex';
        elements.successModal.dataset.offerUrl = offerUrl;

    } catch (err) {
        console.error('Error creating offer:', err);
        showError('Failed to create offer: ' + err.message);
        elements.createOfferBtn.disabled = false;

        // Fire-and-forget: notify server so it can track the orphaned escrow
        if (pendingEscrow) {
            fetch('/api/swap/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...pendingEscrow,
                    signature: 'recovery-orphan',
                    message: 'orphan-escrow-report'
                })
            }).catch(() => {});
        }
    }
}

async function escrowInitiatorAssets(nfts, solAmount) {
    const provider = getWalletProvider();
    const signer = provider.publicKey;
    const escrowPubkey = new solanaWeb3.PublicKey(ESCROW_WALLET);
    const feePubkey = new solanaWeb3.PublicKey(FEE_WALLET);

    try {
        const transaction = new solanaWeb3.Transaction();

        if (!isOrcHolder) {
            const feeLamports = Math.floor(PLATFORM_FEE * solanaWeb3.LAMPORTS_PER_SOL);
            transaction.add(
                solanaWeb3.SystemProgram.transfer({
                    fromPubkey: signer,
                    toPubkey: feePubkey,
                    lamports: feeLamports,
                })
            );
        }

        if (solAmount > 0) {
            const lamports = Math.floor(solAmount * solanaWeb3.LAMPORTS_PER_SOL);
            transaction.add(
                solanaWeb3.SystemProgram.transfer({
                    fromPubkey: signer,
                    toPubkey: escrowPubkey,
                    lamports: lamports,
                })
            );
        }

        const assetResults = await Promise.all(nfts.map(nft => getAssetWithProof(nft.id)));
        const assetMap = new Map(nfts.map((nft, i) => [nft.id, assetResults[i]]));

        for (const nft of nfts) {
            const asset = assetMap.get(nft.id);

            if (asset?.interface === 'MplCoreAsset') {
                const collection = asset.grouping?.find(g => g.group_key === 'collection')?.group_value;
                const ix = createMplCoreTransferInstruction(nft.id, signer, escrowPubkey, collection);
                transaction.add(ix);
            } else if (asset?.compression?.compressed === true) {
                await transferCompressedNFT(nft.id, signer, escrowPubkey, transaction);
            } else {
                const mint = new solanaWeb3.PublicKey(nft.id);
                const sourceAta = await getATA(mint, signer);
                const destAta = await getATA(mint, escrowPubkey);

                if (!(await ataExists(destAta))) {
                    transaction.add(createATAInstruction(mint, escrowPubkey, signer));
                }

                transaction.add(createTokenTransferInstruction(sourceAta, destAta, signer, 1));
            }
        }

        if (transaction.instructions.length === 0) {
            return { success: true, signature: null };
        }

        transaction.feePayer = signer;

        showLoading('Check your wallet for an approval request...');

        const result = await signAndSubmitTransaction(transaction);

        if (result.success) {
            showLoading('Transaction submitted, confirming on-chain...');
        }

        return result;

    } catch (err) {
        console.error('Escrow failed:', err);
        return { success: false, error: err.message };
    }
}

function copyOfferLink() {
    const linkInput = elements.offerLinkInput;
    linkInput.select();
    navigator.clipboard.writeText(linkInput.value).then(() => {
        elements.copyLinkBtn.textContent = 'Copied!';
        setTimeout(() => {
            elements.copyLinkBtn.textContent = 'Copy';
        }, 2000);
    });
}

function checkPendingEscrowRecovery() {
    if (!connectedWallet) return;

    const key = `pendingEscrow:${connectedWallet}`;
    const raw = localStorage.getItem(key);
    if (!raw) return;

    let pending;
    try {
        pending = JSON.parse(raw);
    } catch (e) {
        localStorage.removeItem(key);
        return;
    }

    // Discard if older than 24 hours
    if (Date.now() - pending.savedAt > 24 * 60 * 60 * 1000) {
        localStorage.removeItem(key);
        return;
    }

    showEscrowRecoveryBanner(pending);
}

function showEscrowRecoveryBanner(pending) {
    // Remove any existing banner
    const existing = document.getElementById('escrow-recovery-banner');
    if (existing) existing.remove();

    const banner = document.createElement('div');
    banner.id = 'escrow-recovery-banner';
    banner.className = 'escrow-recovery-banner';

    const nftCount = (pending.initiatorNfts || []).length;
    const solPart = pending.initiatorSol > 0 ? `${pending.initiatorSol} SOL` : '';
    const nftPart = nftCount > 0 ? `${nftCount} NFT${nftCount > 1 ? 's' : ''}` : '';
    const assetDesc = [nftPart, solPart].filter(Boolean).join(' + ') || 'assets';
    const shortReceiver = pending.receiverWallet
        ? pending.receiverWallet.slice(0, 4) + '...' + pending.receiverWallet.slice(-4)
        : 'unknown';

    banner.innerHTML = `
        <div class="escrow-recovery-text">
            <strong>Pending Escrow Found</strong>
            <span>You have ${assetDesc} in escrow for a trade with ${shortReceiver} that wasn't completed. You can retry creating the offer or dismiss this notice.</span>
        </div>
        <div class="escrow-recovery-error" style="display:none;"></div>
        <div class="escrow-recovery-actions">
            <button class="escrow-recovery-retry">Retry</button>
            <button class="escrow-recovery-dismiss">Dismiss</button>
        </div>
    `;

    banner.querySelector('.escrow-recovery-retry').addEventListener('click', function() {
        retryPendingEscrow(pending);
    });

    banner.querySelector('.escrow-recovery-dismiss').addEventListener('click', function() {
        localStorage.removeItem(`pendingEscrow:${connectedWallet}`);
        banner.remove();
    });

    // Insert at top of container
    const container = document.querySelector('.container');
    if (container) {
        const firstChild = container.firstChild;
        container.insertBefore(banner, firstChild);
    } else {
        document.body.prepend(banner);
    }
}

async function retryPendingEscrow(pending) {
    const banner = document.getElementById('escrow-recovery-banner');
    const retryBtn = banner?.querySelector('.escrow-recovery-retry');
    const errorDiv = banner?.querySelector('.escrow-recovery-error');

    if (retryBtn) {
        retryBtn.disabled = true;
        retryBtn.textContent = 'Signing...';
    }
    if (errorDiv) errorDiv.style.display = 'none';

    try {
        const timestamp = Date.now();
        const message = `Midswap create offer from ${pending.initiatorWallet} to ${pending.receiverWallet} at ${timestamp}`;
        const signature = await signMessageForAuth(message);

        if (retryBtn) retryBtn.textContent = 'Saving...';

        const response = await fetch('/api/swap/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                initiatorWallet: pending.initiatorWallet,
                receiverWallet: pending.receiverWallet,
                initiatorNfts: pending.initiatorNfts,
                receiverNfts: pending.receiverNfts,
                initiatorSol: pending.initiatorSol,
                receiverSol: pending.receiverSol,
                initiatorNftDetails: pending.initiatorNftDetails,
                receiverNftDetails: pending.receiverNftDetails,
                escrowTxSignature: pending.escrowTxSignature,
                isOrcHolder: pending.isOrcHolder,
                signature: signature,
                message: message
            })
        });

        const data = await response.json();

        if (data.error) {
            throw new Error(data.error);
        }

        // Success — clean up and show result
        localStorage.removeItem(`pendingEscrow:${connectedWallet}`);
        if (banner) banner.remove();

        const offerUrl = `${window.location.origin}/swap/offer.html?id=${data.offerId}`;
        if (elements.offerLinkInput) elements.offerLinkInput.value = offerUrl;
        if (elements.successModal) {
            elements.successModal.style.display = 'flex';
            elements.successModal.dataset.offerUrl = offerUrl;
        }
    } catch (err) {
        console.error('Escrow recovery retry failed:', err);
        if (retryBtn) {
            retryBtn.disabled = false;
            retryBtn.textContent = 'Retry';
        }
        if (errorDiv) {
            errorDiv.textContent = 'Retry failed: ' + err.message;
            errorDiv.style.display = 'block';
        }
    }
}

function resetCreateOfferPage() {
    elements.successModal.style.display = 'none';
    selectedYourNFTs = [];
    selectedTheirNFTs = [];

    if (elements.yourSolAmount) elements.yourSolAmount.value = '0';
    if (elements.theirSolAmount) elements.theirSolAmount.value = '0';

    document.querySelectorAll('.nft-card.selected').forEach(card => {
        card.classList.remove('selected');
    });
    document.querySelectorAll('.selection-indicator').forEach(ind => {
        ind.textContent = '';
    });

    updateSelectionCounts();
    updateTradeSummary();
}
