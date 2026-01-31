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
        'Approve escrow transaction in wallet',
        'Sending assets to escrow',
        'Sign message to verify wallet',
        'Confirming transaction on-chain',
        'Saving offer'
    ];
    showSteppedLoading(createSteps, 0);
    elements.createOfferBtn.disabled = true;

    try {
        showSteppedLoading(createSteps, 0);
        const escrowResult = await escrowInitiatorAssets(selectedYourNFTs, yourSol);

        if (!escrowResult.success) {
            throw new Error(escrowResult.error || 'Failed to escrow assets');
        }

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

        hideLoading();

        const offerUrl = `${window.location.origin}/swap/offer.html?id=${data.offerId}`;
        elements.offerLinkInput.value = offerUrl;
        elements.successModal.style.display = 'flex';
        elements.successModal.dataset.offerUrl = offerUrl;

    } catch (err) {
        console.error('Error creating offer:', err);
        showError('Failed to create offer: ' + err.message);
        elements.createOfferBtn.disabled = false;
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

        showLoading('Please approve the escrow transaction in your wallet...');

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
