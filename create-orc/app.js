(function() {
    var canvas = document.getElementById('orcCanvas');
    var ctx = canvas.getContext('2d');
    var traitsColumn = document.getElementById('traits-column');

    // Current selections: layerId -> optionId (or null for none)
    var selections = {};
    // Loaded images: key -> Image (keys like "optionId" or "optionId-open")
    var layerImages = {};
    var imagesLoaded = false;

    // Initialize default selections
    ORC_TRAITS.forEach(function(layer) {
        selections[layer.id] = layer.required ? layer.options[0].id : null;
    });

    // --- Helpers ---

    function isOpenMouth() {
        return selections.mouth === 'mouth-open';
    }

    function getImagePath(layerId, filename) {
        return '/create-orc/layers/' + layerId + '/' + filename;
    }

    function findOption(layerId, optionId) {
        var layer = ORC_TRAITS.find(function(l) { return l.id === layerId; });
        if (!layer) return null;
        return layer.options.find(function(o) { return o.id === optionId; });
    }

    // Get the correct image key for rendering (handles open mouth variants)
    function getImageKey(layerId, optionId) {
        if (!optionId) return null;
        if ((layerId === 'skin' || layerId === 'clothing') && isOpenMouth()) {
            var option = findOption(layerId, optionId);
            if (option && option.hasOpen) {
                return optionId + '-open';
            }
        }
        return optionId;
    }

    // --- Image Loading ---

    function preloadImages(callback) {
        var total = 0;
        var loaded = 0;

        // Count all images to load
        ORC_TRAITS.forEach(function(layer) {
            layer.options.forEach(function(option) {
                if (option.image) total++;
                if (option.hasOpen) total++;
            });
        });

        if (total === 0) { callback(); return; }

        function onLoad() {
            loaded++;
            if (loaded === total) {
                imagesLoaded = true;
                callback();
            }
        }

        ORC_TRAITS.forEach(function(layer) {
            layer.options.forEach(function(option) {
                // Load standard image
                if (option.image) {
                    var img = new Image();
                    img.onload = onLoad;
                    img.onerror = function() {
                        console.warn('Failed to load: ' + getImagePath(layer.id, option.image));
                        onLoad();
                    };
                    img.src = getImagePath(layer.id, option.image);
                    layerImages[option.id] = img;
                }

                // Load open mouth variant if available
                if (option.hasOpen) {
                    var openDir = layer.id + '-open';
                    var imgOpen = new Image();
                    imgOpen.onload = onLoad;
                    imgOpen.onerror = function() {
                        console.warn('Failed to load open variant: ' + getImagePath(openDir, option.image));
                        onLoad();
                    };
                    imgOpen.src = getImagePath(openDir, option.image);
                    layerImages[option.id + '-open'] = imgOpen;
                }
            });
        });
    }

    // --- Canvas Rendering ---

    function drawLayer(context, width, height, layerId, optionId) {
        if (!optionId) return;

        // mouth-open is a mode toggle, not a drawable layer
        if (optionId === 'mouth-open') return;

        var key = getImageKey(layerId, optionId);
        var img = key ? layerImages[key] : null;
        if (img && img.complete && img.naturalWidth > 0) {
            context.drawImage(img, 0, 0, width, height);
        }
    }

    function renderCanvas() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ORC_TRAITS.forEach(function(layer) {
            drawLayer(ctx, canvas.width, canvas.height, layer.id, selections[layer.id]);
        });
    }

    // --- Build Trait Selectors ---

    function buildTraitSelectors() {
        traitsColumn.innerHTML = '';

        ORC_TRAITS.forEach(function(layer) {
            var group = document.createElement('div');
            group.className = 'trait-group';

            var header = document.createElement('div');
            header.className = 'trait-group-header';

            var name = document.createElement('span');
            name.className = 'trait-group-name';
            name.textContent = layer.name;

            var tag = document.createElement('span');
            tag.className = 'trait-group-tag';
            tag.textContent = layer.required ? 'Required' : 'Optional';

            header.appendChild(name);
            header.appendChild(tag);
            group.appendChild(header);

            var grid = document.createElement('div');
            grid.className = 'trait-options';

            // Add "None" option for optional layers
            if (!layer.required) {
                var noneBtn = document.createElement('div');
                noneBtn.className = 'trait-option none-option' + (selections[layer.id] === null ? ' selected' : '');
                noneBtn.setAttribute('data-layer', layer.id);
                noneBtn.setAttribute('data-option', 'none');

                var noneThumb = document.createElement('div');
                noneThumb.className = 'none-thumb';
                noneThumb.textContent = '\u2205';

                var noneLabel = document.createElement('span');
                noneLabel.className = 'trait-label';
                noneLabel.textContent = 'None';

                noneBtn.appendChild(noneThumb);
                noneBtn.appendChild(noneLabel);
                noneBtn.addEventListener('click', function() {
                    selectTrait(layer.id, null);
                });
                grid.appendChild(noneBtn);
            }

            layer.options.forEach(function(option) {
                var btn = document.createElement('div');
                btn.className = 'trait-option' + (selections[layer.id] === option.id ? ' selected' : '');
                btn.setAttribute('data-layer', layer.id);
                btn.setAttribute('data-option', option.id);

                var thumb = document.createElement('img');
                thumb.className = 'trait-thumbnail';
                thumb.src = getImagePath(layer.id, option.image);
                thumb.alt = option.name;
                thumb.loading = 'lazy';
                btn.appendChild(thumb);

                var label = document.createElement('span');
                label.className = 'trait-label';
                label.textContent = option.name;

                btn.appendChild(label);
                btn.addEventListener('click', function() {
                    selectTrait(layer.id, option.id);
                });
                grid.appendChild(btn);
            });

            group.appendChild(grid);
            traitsColumn.appendChild(group);
        });
    }

    // --- Collection Rarity Data ---

    var COLLECTION_ID = 'w44WvLKRdLGye2ghhDJBxcmnWpBo31A1tCBko2G6DgW';
    var traitCounts = {};  // { traitType: { value: count } }
    var collectionTotal = 0;
    var statsLoaded = false;

    // Map layer IDs to on-chain trait_type names
    var LAYER_TO_TRAIT_TYPE = {
        background: 'Background',
        skin: 'Skin',
        eyewear: 'Eyewear',
        mouth: 'Mouth',
        headwear: 'Headwear',
        clothing: 'Clothing',
        specialty: 'Specialty'
    };

    var STATS_CACHE_KEY = 'orc-creator-stats';
    var STATS_CACHE_MAX_AGE = 60 * 60 * 1000; // 1 hour

    function loadCachedStats() {
        try {
            var raw = localStorage.getItem(STATS_CACHE_KEY);
            if (!raw) return false;
            var cached = JSON.parse(raw);
            if (Date.now() - cached.timestamp > STATS_CACHE_MAX_AGE) return false;
            traitCounts = cached.traitCounts;
            collectionTotal = cached.collectionTotal;
            statsLoaded = true;
            computeTraitTiers();
            sortTraitsByRarity();
            buildTraitSelectors();
            return true;
        } catch (e) {
            return false;
        }
    }

    function saveCachedStats() {
        try {
            localStorage.setItem(STATS_CACHE_KEY, JSON.stringify({
                timestamp: Date.now(),
                traitCounts: traitCounts,
                collectionTotal: collectionTotal
            }));
        } catch (e) {
            // localStorage full or unavailable
        }
    }

    function applyFreshStats() {
        statsLoaded = true;
        computeTraitTiers();
        sortTraitsByRarity();
        buildTraitSelectors();
        saveCachedStats();
    }

    function fetchCollectionStats() {
        var hadCache = loadCachedStats();
        var freshCounts = {};
        var freshTotal = 0;
        var page = 1;

        function fetchPage() {
            fetch('/api/helius', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ collection: COLLECTION_ID, page: page })
            })
            .then(function(res) { return res.json(); })
            .then(function(data) {
                var items = data.items || [];
                items.forEach(function(nft) {
                    var name = (nft.content && nft.content.metadata && nft.content.metadata.name) || '';
                    if (nft.burnt || name.toLowerCase().indexOf('graveyard') !== -1) return;
                    if (name.toLowerCase().indexOf('orc') === -1) return;

                    freshTotal++;
                    var attrs = (nft.content && nft.content.metadata && nft.content.metadata.attributes) || [];
                    attrs.forEach(function(attr) {
                        if (attr.trait_type && attr.value) {
                            if (!freshCounts[attr.trait_type]) freshCounts[attr.trait_type] = {};
                            freshCounts[attr.trait_type][attr.value] = (freshCounts[attr.trait_type][attr.value] || 0) + 1;
                        }
                    });
                });

                if (items.length === 1000) {
                    page++;
                    fetchPage();
                } else {
                    traitCounts = freshCounts;
                    collectionTotal = freshTotal;
                    applyFreshStats();
                }
            })
            .catch(function(err) {
                console.warn('Failed to fetch collection stats:', err);
            });
        }

        fetchPage();
    }

    function sortTraitsByRarity() {
        ORC_TRAITS.forEach(function(layer) {
            var traitType = LAYER_TO_TRAIT_TYPE[layer.id];
            if (!traitType || !traitCounts[traitType]) return;
            var counts = traitCounts[traitType];
            layer.options.sort(function(a, b) {
                var countA = counts[a.name] || 0;
                var countB = counts[b.name] || 0;
                return countA - countB;
            });
        });
    }

    function getTraitStats(layerId, optionName) {
        if (!statsLoaded) return null;
        var traitType = LAYER_TO_TRAIT_TYPE[layerId];
        if (!traitType || !traitCounts[traitType]) return null;
        var count = traitCounts[traitType][optionName] || 0;
        var pct = collectionTotal > 0 ? ((count / collectionTotal) * 100) : 0;
        return { count: count, total: collectionTotal, pct: pct };
    }

    // Pre-computed composite rarity tiers: { traitType: { value: { label, cls } } }
    var traitTiers = {};

    function computeTraitTiers() {
        var TIERS = [
            { label: 'Legendary', cls: 'tier-legendary' },
            { label: 'Epic', cls: 'tier-epic' },
            { label: 'Rare', cls: 'tier-rare' },
            { label: 'Common', cls: 'tier-common' }
        ];

        // 1. Global percentile: rank among ALL traits
        var allTraits = [];
        for (var tt in traitCounts) {
            for (var v in traitCounts[tt]) {
                allTraits.push({ traitType: tt, value: v, count: traitCounts[tt][v] });
            }
        }
        allTraits.sort(function(a, b) { return a.count - b.count; });
        var globalPct = {};
        for (var i = 0; i < allTraits.length; i++) {
            globalPct[allTraits[i].traitType + '|' + allTraits[i].value] = i / allTraits.length;
        }

        // 2. Per-group percentile + composite
        for (var traitType in traitCounts) {
            var entries = [];
            for (var val in traitCounts[traitType]) {
                entries.push({ value: val, count: traitCounts[traitType][val] });
            }
            entries.sort(function(a, b) { return a.count - b.count; });

            traitTiers[traitType] = {};
            var n = entries.length;
            for (var j = 0; j < n; j++) {
                var groupPct = j / n;
                var gp = globalPct[traitType + '|' + entries[j].value] || 0;
                var composite = gp * 0.6 + groupPct * 0.4;

                var tierIndex;
                if (composite < 0.15) tierIndex = 0;
                else if (composite < 0.35) tierIndex = 1;
                else if (composite < 0.65) tierIndex = 2;
                else tierIndex = 3;
                traitTiers[traitType][entries[j].value] = TIERS[tierIndex];
            }
        }
    }

    function getRarityTier(layerId, optionName) {
        var traitType = LAYER_TO_TRAIT_TYPE[layerId];
        if (traitType && traitTiers[traitType] && traitTiers[traitType][optionName]) {
            return traitTiers[traitType][optionName];
        }
        return { label: 'Common', cls: 'tier-common' };
    }

    // --- Hover Preview ---

    var preview = document.createElement('div');
    preview.className = 'trait-preview';
    var previewImg = document.createElement('img');
    previewImg.alt = '';
    var previewInfo = document.createElement('div');
    previewInfo.className = 'trait-preview-info';
    preview.appendChild(previewImg);
    preview.appendChild(previewInfo);
    document.body.appendChild(preview);

    function updatePreviewInfo(traitOption) {
        if (!traitOption) {
            previewInfo.style.display = 'none';
            return;
        }

        var layerId = traitOption.layerId;
        var optionName = traitOption.name;
        var stats = getTraitStats(layerId, optionName);

        var html = '<div class="trait-preview-name">' + optionName + '</div>';

        if (stats) {
            var tier = getRarityTier(layerId, optionName);
            html += '<div class="trait-preview-stats">';
            html += '<span class="trait-preview-rarity">' + stats.pct.toFixed(1) + '% of Orcs (' + stats.count + ')</span>';
            html += '<span class="trait-preview-tier ' + tier.cls + '">' + tier.label + '</span>';
            html += '</div>';
        } else {
            html += '<div class="trait-preview-rarity">Loading stats...</div>';
        }

        previewInfo.innerHTML = html;
        previewInfo.style.display = 'block';
    }

    traitsColumn.addEventListener('mouseover', function(e) {
        var optionEl = e.target.closest('.trait-option');
        if (!optionEl || optionEl.classList.contains('none-option')) return;
        var thumb = optionEl.querySelector('.trait-thumbnail');
        if (!thumb) return;

        var layerId = optionEl.getAttribute('data-layer');
        var optionId = optionEl.getAttribute('data-option');
        var option = findOption(layerId, optionId);

        previewImg.src = thumb.src;
        updatePreviewInfo(option ? { layerId: layerId, name: option.name } : null);
        preview.style.display = 'block';
    });

    traitsColumn.addEventListener('mouseout', function(e) {
        var optionEl = e.target.closest('.trait-option');
        if (!optionEl) return;
        preview.style.display = 'none';
    });

    traitsColumn.addEventListener('mousemove', function(e) {
        if (preview.style.display !== 'block') return;
        var x = e.clientX + 15;
        var y = e.clientY - 120;
        if (x + 210 > window.innerWidth) x = e.clientX - 215;
        if (y < 5) y = 5;
        if (y + 260 > window.innerHeight) y = window.innerHeight - 260;
        preview.style.left = x + 'px';
        preview.style.top = y + 'px';
    });

    // --- Selection Logic ---

    function selectTrait(layerId, optionId) {
        var layer = ORC_TRAITS.find(function(l) { return l.id === layerId; });
        // Toggle off if clicking the already-selected option on an optional layer
        if (!layer.required && selections[layerId] === optionId) {
            selections[layerId] = null;
        } else {
            selections[layerId] = optionId;
        }
        updateSelectionUI(layerId);
        renderCanvas();
    }

    function updateSelectionUI(layerId) {
        var options = traitsColumn.querySelectorAll('[data-layer="' + layerId + '"]');
        options.forEach(function(el) {
            var elOption = el.getAttribute('data-option');
            if ((elOption === 'none' && selections[layerId] === null) ||
                (elOption === selections[layerId])) {
                el.classList.add('selected');
            } else {
                el.classList.remove('selected');
            }
        });
    }

    // --- Randomize ---

    function randomize() {
        ORC_TRAITS.forEach(function(layer) {
            var opts = layer.options;
            if (layer.required) {
                selections[layer.id] = opts[Math.floor(Math.random() * opts.length)].id;
            } else {
                // 40% chance of "None" for optional traits
                if (Math.random() < 0.4) {
                    selections[layer.id] = null;
                } else {
                    selections[layer.id] = opts[Math.floor(Math.random() * opts.length)].id;
                }
            }
        });
        ORC_TRAITS.forEach(function(layer) {
            updateSelectionUI(layer.id);
        });
        renderCanvas();
    }

    // --- Clear All ---

    function clearAll() {
        ORC_TRAITS.forEach(function(layer) {
            selections[layer.id] = layer.required ? layer.options[0].id : null;
        });
        ORC_TRAITS.forEach(function(layer) {
            updateSelectionUI(layer.id);
        });
        renderCanvas();
    }

    // --- Export Functions ---

    function renderHighRes(size) {
        var exportCanvas = document.createElement('canvas');
        exportCanvas.width = size;
        exportCanvas.height = size;
        var ec = exportCanvas.getContext('2d');

        ec.fillStyle = '#111';
        ec.fillRect(0, 0, size, size);

        ORC_TRAITS.forEach(function(layer) {
            drawLayer(ec, size, size, layer.id, selections[layer.id]);
        });

        return exportCanvas;
    }

    function exportSquare() {
        var exportCanvas = renderHighRes(1000);
        showPreview(exportCanvas, 'orc-pfp-square.png');
    }

    function exportCircle() {
        var source = renderHighRes(1000);
        var exportCanvas = document.createElement('canvas');
        exportCanvas.width = 1000;
        exportCanvas.height = 1000;
        var ec = exportCanvas.getContext('2d');
        ec.beginPath();
        ec.arc(500, 500, 500, 0, Math.PI * 2);
        ec.closePath();
        ec.clip();
        ec.drawImage(source, 0, 0);
        showPreview(exportCanvas, 'orc-pfp-circle.png');
    }

    function exportBorder() {
        var source = renderHighRes(1000);
        var borderWidth = 20;
        var exportCanvas = document.createElement('canvas');
        exportCanvas.width = 1000;
        exportCanvas.height = 1000;
        var ec = exportCanvas.getContext('2d');
        ec.fillStyle = '#D4A017';
        ec.fillRect(0, 0, 1000, 1000);
        ec.drawImage(source, borderWidth, borderWidth, 1000 - borderWidth * 2, 1000 - borderWidth * 2);
        ec.strokeStyle = '#8a6a3a';
        ec.lineWidth = 3;
        ec.strokeRect(borderWidth, borderWidth, 1000 - borderWidth * 2, 1000 - borderWidth * 2);
        showPreview(exportCanvas, 'orc-pfp-border.png');
    }

    function exportCard() {
        var W = 750, H = 1050;
        var cardCanvas = document.createElement('canvas');
        cardCanvas.width = W;
        cardCanvas.height = H;
        var cc = cardCanvas.getContext('2d');

        var gold = '#D4A017';
        var brown = '#8a6a3a';
        var bg = '#1e2520';
        var muted = '#9a9484';

        var tierColors = {
            'tier-legendary': '#ffd700',
            'tier-epic': '#a855f7',
            'tier-rare': '#3b82f6',
            'tier-common': '#9a9484'
        };

        // Card background
        cc.fillStyle = bg;
        cc.fillRect(0, 0, W, H);

        // Header bar
        cc.fillStyle = '#111';
        cc.fillRect(0, 0, W, 60);
        cc.save();
        cc.shadowColor = '#D4A017';
        cc.shadowBlur = 12;
        cc.fillStyle = gold;
        cc.font = '32px MedievalSharp, serif';
        cc.textAlign = 'center';
        cc.textBaseline = 'middle';
        cc.fillText('THE HORDE', W / 2, 32);
        cc.restore();

        // Orc image
        var imgSize = 620;
        var imgX = (W - imgSize) / 2;
        var imgY = 70;
        var orcCanvas = renderHighRes(imgSize);

        // Gold border frame around orc image
        var borderPad = 4;
        var frameX = imgX - borderPad;
        var frameW = imgSize + borderPad * 2;
        cc.fillStyle = gold;
        cc.fillRect(frameX, imgY - borderPad, frameW, imgSize + borderPad * 2);
        cc.strokeStyle = brown;
        cc.lineWidth = 2;
        cc.strokeRect(frameX, imgY - borderPad, frameW, imgSize + borderPad * 2);

        // Draw orc image
        cc.drawImage(orcCanvas, imgX, imgY);

        // Traits panel — aligned with image frame
        var panelX = frameX;
        var panelW = frameW;
        var panelY = imgY + imgSize + 12;
        var panelH = H - panelY - 40;
        cc.fillStyle = '#111';
        cc.fillRect(panelX, panelY, panelW, panelH);
        cc.strokeStyle = '#2a2a2a';
        cc.lineWidth = 1;
        cc.strokeRect(panelX, panelY, panelW, panelH);

        // Collect active traits
        var activeTraits = [];
        ORC_TRAITS.forEach(function(layer) {
            var optId = selections[layer.id];
            if (!optId) return;
            var option = findOption(layer.id, optId);
            if (!option) return;
            // Skip mouth-open mode toggle
            if (optId === 'mouth-open') return;
            activeTraits.push({ layerId: layer.id, layerName: layer.name, option: option });
        });

        var traitStartY = panelY + 16;
        var traitAreaH = panelH - 32;
        var rowH = activeTraits.length > 0 ? Math.min(46, traitAreaH / activeTraits.length) : 46;
        var leftCol = panelX + 20;
        var midCol = panelX + 150;
        var rightCol = panelX + panelW - 20;

        cc.textBaseline = 'middle';

        activeTraits.forEach(function(t, i) {
            var y = traitStartY + i * rowH + rowH / 2;

            // Rarity tier + color for this trait
            var stats = getTraitStats(t.layerId, t.option.name);
            var tier = getRarityTier(t.layerId, t.option.name);
            var tierColor = tierColors[tier.cls] || tierColors['tier-common'];

            // Trait group name in gold
            cc.fillStyle = gold;
            cc.font = '16px MedievalSharp, serif';
            cc.textAlign = 'left';
            cc.fillText(t.layerName, leftCol, y);

            // Trait value colored by rarity tier
            cc.fillStyle = tierColor;
            cc.font = '700 18px Cinzel, serif';
            cc.textAlign = 'left';
            cc.fillText(t.option.name, midCol, y);

            // Percentage colored by tier
            if (stats) {
                cc.fillStyle = tierColor;
                cc.font = '15px Crimson Text, serif';
                cc.textAlign = 'right';
                cc.fillText(stats.pct.toFixed(1) + '%', rightCol, y);
            }

            // Tier badge
            var badgeX = stats ? rightCol - 60 : rightCol;
            // Tier dot with glow
            cc.save();
            cc.shadowColor = tierColor;
            cc.shadowBlur = 6;
            cc.beginPath();
            cc.arc(badgeX - 55, y, 5, 0, Math.PI * 2);
            cc.fillStyle = tierColor;
            cc.fill();
            cc.restore();
            // Tier label
            cc.fillStyle = tierColor;
            cc.font = '14px MedievalSharp, serif';
            cc.textAlign = 'left';
            cc.fillText(tier.label, badgeX - 47, y);
        });

        if (activeTraits.length === 0) {
            cc.fillStyle = muted;
            cc.font = '20px MedievalSharp, serif';
            cc.textAlign = 'center';
            cc.fillText('No traits selected', W / 2, panelY + traitAreaH / 2);
        }

        // Footer
        cc.fillStyle = gold;
        cc.font = '14px MedievalSharp, serif';
        cc.textAlign = 'center';
        cc.textBaseline = 'bottom';
        cc.fillText('midhorde.com', W / 2, H - 12);

        showPreview(cardCanvas, 'orc-card.png');
    }

    function triggerDownload(exportCanvas, filename) {
        var link = document.createElement('a');
        link.download = filename;
        link.href = exportCanvas.toDataURL('image/png');
        link.click();
    }

    // --- Export Preview Modal ---

    var exportModal = document.getElementById('export-modal');
    var exportModalImg = document.getElementById('export-modal-img');
    var pendingDownloadData = null;
    var pendingDownloadFilename = null;

    function showPreview(exportCanvas, filename) {
        pendingDownloadData = exportCanvas.toDataURL('image/png');
        pendingDownloadFilename = filename;
        exportModalImg.src = pendingDownloadData;
        exportModal.classList.add('active');
    }

    document.getElementById('export-modal-download').addEventListener('click', function() {
        if (pendingDownloadData && pendingDownloadFilename) {
            var link = document.createElement('a');
            link.download = pendingDownloadFilename;
            link.href = pendingDownloadData;
            link.click();
        }
        exportModal.classList.remove('active');
        pendingDownloadData = null;
        pendingDownloadFilename = null;
    });

    document.getElementById('export-modal-close').addEventListener('click', function() {
        exportModal.classList.remove('active');
        pendingDownloadData = null;
        pendingDownloadFilename = null;
    });

    exportModal.addEventListener('click', function(e) {
        if (e.target === exportModal) {
            exportModal.classList.remove('active');
            pendingDownloadData = null;
            pendingDownloadFilename = null;
        }
    });

    // --- Event Listeners ---

    document.getElementById('btn-randomize').addEventListener('click', randomize);
    document.getElementById('btn-clear').addEventListener('click', clearAll);
    document.getElementById('btn-export-square').addEventListener('click', exportSquare);
    document.getElementById('btn-export-circle').addEventListener('click', exportCircle);
    document.getElementById('btn-export-border').addEventListener('click', exportBorder);
    document.getElementById('btn-export-card').addEventListener('click', exportCard);

    // --- Init ---

    // Show loading state
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#9a9484';
    ctx.font = '20px Cinzel, serif';
    ctx.textAlign = 'center';
    ctx.fillText('Loading assets...', canvas.width / 2, canvas.height / 2);

    preloadImages(function() {
        buildTraitSelectors();
        renderCanvas();
    });

    // Fetch collection rarity stats in background
    fetchCollectionStats();
})();
