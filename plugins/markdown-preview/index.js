import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Fragment, jsx, jsxs } from "react/jsx-runtime";
//#region ../../packages/plugin-sdk/src/helper.ts
/**
* Type-safe helper to define a Bowerbird preview or metadata plugin.
*/
function definePlugin(plugin) {
	return plugin;
}
//#endregion
//#region src/index.tsx
function parseFrontmatterAndBody(raw) {
	const trimmed = raw.trimStart();
	if (!trimmed.startsWith("---")) return {
		frontmatter: null,
		body: raw
	};
	const endIdx = trimmed.indexOf("\n---", 3);
	if (endIdx === -1) return {
		frontmatter: null,
		body: raw
	};
	const yamlBlock = trimmed.slice(3, endIdx).trim();
	const body = trimmed.slice(endIdx + 4).trimStart();
	const frontmatter = {};
	for (const line of yamlBlock.split("\n")) {
		const colon = line.indexOf(":");
		if (colon > 0) {
			const key = line.slice(0, colon).trim();
			let val = line.slice(colon + 1).trim();
			if (val.startsWith("\"") && val.endsWith("\"") || val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
			if (val.startsWith("[") && val.endsWith("]")) frontmatter[key] = val.slice(1, -1).split(",").map((s) => s.trim().replace(/^['"]|['"]$/g, "")).filter(Boolean);
			else frontmatter[key] = val;
		}
	}
	return {
		frontmatter,
		body
	};
}
function extractOutline(text) {
	const lines = text.split("\n");
	const outline = [];
	let inCode = false;
	for (const line of lines) {
		if (line.trim().startsWith("```")) {
			inCode = !inCode;
			continue;
		}
		if (inCode) continue;
		const match = line.match(/^(#{1,6})\s+(.*)$/);
		if (match) {
			const level = match[1].length;
			const text = match[2].trim().replace(/[#*`_~]/g, "");
			const id = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
			outline.push({
				level,
				text,
				id
			});
		}
	}
	return outline;
}
function renderInlineMarkdown(text, onLinkClick) {
	const nodes = [];
	let remaining = text;
	let keyIdx = 0;
	while (remaining.length > 0) {
		const codeMatch = remaining.match(/^`([^`]+)`/);
		if (codeMatch) {
			nodes.push(/* @__PURE__ */ jsx("code", {
				style: {
					fontFamily: "monospace",
					fontSize: "0.875em",
					padding: "0.15em 0.35em",
					borderRadius: "4px",
					background: "rgba(120, 120, 140, 0.15)",
					color: "#e06c75"
				},
				children: codeMatch[1]
			}, `code-${keyIdx++}`));
			remaining = remaining.slice(codeMatch[0].length);
			continue;
		}
		const boldMatch = remaining.match(/^\*\*([^*]+)\*\*/);
		if (boldMatch) {
			nodes.push(/* @__PURE__ */ jsx("strong", { children: boldMatch[1] }, `bold-${keyIdx++}`));
			remaining = remaining.slice(boldMatch[0].length);
			continue;
		}
		const italicMatch = remaining.match(/^\*([^*]+)\*/);
		if (italicMatch) {
			nodes.push(/* @__PURE__ */ jsx("em", { children: italicMatch[1] }, `italic-${keyIdx++}`));
			remaining = remaining.slice(italicMatch[0].length);
			continue;
		}
		const strikeMatch = remaining.match(/^~~([^~]+)~~/);
		if (strikeMatch) {
			nodes.push(/* @__PURE__ */ jsx("del", { children: strikeMatch[1] }, `del-${keyIdx++}`));
			remaining = remaining.slice(strikeMatch[0].length);
			continue;
		}
		const linkMatch = remaining.match(/^\[([^\]]+)\]\(([^)]+)\)/);
		if (linkMatch) {
			const url = linkMatch[2];
			nodes.push(/* @__PURE__ */ jsx("a", {
				href: url,
				onClick: (e) => {
					e.preventDefault();
					onLinkClick?.(url);
				},
				style: {
					color: "#60a5fa",
					textDecoration: "underline",
					textUnderlineOffset: "3px",
					cursor: "pointer"
				},
				children: linkMatch[1]
			}, `a-${keyIdx++}`));
			remaining = remaining.slice(linkMatch[0].length);
			continue;
		}
		const nextSpecial = remaining.search(/[`*_~\[]/);
		if (nextSpecial === -1) {
			nodes.push(remaining);
			break;
		} else if (nextSpecial === 0) {
			nodes.push(remaining[0]);
			remaining = remaining.slice(1);
		} else {
			nodes.push(remaining.slice(0, nextSpecial));
			remaining = remaining.slice(nextSpecial);
		}
	}
	return nodes;
}
function MarkdownRenderer({ body, onLinkClick }) {
	const [copiedIndex, setCopiedIndex] = useState(null);
	const lines = useMemo(() => body.split("\n"), [body]);
	const elements = [];
	let i = 0;
	let blockKey = 0;
	while (i < lines.length) {
		const line = lines[i];
		const trimmed = line.trim();
		if (!trimmed) {
			i++;
			continue;
		}
		if (trimmed.startsWith("```")) {
			const lang = trimmed.slice(3).trim() || "plaintext";
			const codeLines = [];
			i++;
			while (i < lines.length && !lines[i].trim().startsWith("```")) {
				codeLines.push(lines[i]);
				i++;
			}
			if (i < lines.length) i++;
			const fullCode = codeLines.join("\n");
			const currentIdx = blockKey++;
			elements.push(/* @__PURE__ */ jsxs("div", {
				style: {
					margin: "1rem 0",
					borderRadius: "8px",
					overflow: "hidden",
					border: "1px solid rgba(255, 255, 255, 0.1)",
					background: "rgba(18, 18, 22, 0.8)"
				},
				children: [/* @__PURE__ */ jsxs("div", {
					style: {
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
						padding: "0.4rem 0.8rem",
						background: "rgba(255, 255, 255, 0.04)",
						borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
						fontSize: "0.75rem",
						color: "#94a3b8",
						fontFamily: "monospace"
					},
					children: [/* @__PURE__ */ jsx("span", { children: lang }), /* @__PURE__ */ jsx("button", {
						onClick: () => {
							navigator.clipboard.writeText(fullCode);
							setCopiedIndex(currentIdx);
							setTimeout(() => setCopiedIndex(null), 1500);
						},
						style: {
							background: "transparent",
							border: "none",
							color: copiedIndex === currentIdx ? "#10b981" : "#94a3b8",
							cursor: "pointer",
							fontSize: "0.75rem",
							padding: "2px 6px",
							borderRadius: "4px"
						},
						children: copiedIndex === currentIdx ? "Copied!" : "Copy"
					})]
				}), /* @__PURE__ */ jsx("pre", {
					style: {
						padding: "0.8rem 1rem",
						margin: 0,
						overflowX: "auto",
						fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
						fontSize: "0.85rem",
						lineHeight: 1.5,
						color: "#e2e8f0"
					},
					children: /* @__PURE__ */ jsx("code", { children: fullCode })
				})]
			}, `code-block-${currentIdx}`));
			continue;
		}
		const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
		if (headingMatch) {
			const level = headingMatch[1].length;
			const text = headingMatch[2].trim();
			const id = text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
			const Tag = `h${level}`;
			elements.push(/* @__PURE__ */ jsx(Tag, {
				id,
				style: {
					fontSize: [
						"1.875rem",
						"1.5rem",
						"1.25rem",
						"1.1rem",
						"1rem",
						"0.9rem"
					][level - 1],
					fontWeight: 700,
					marginTop: level === 1 ? "1.5rem" : "1.25rem",
					marginBottom: "0.5rem",
					paddingBottom: level <= 2 ? "0.3rem" : void 0,
					borderBottom: level <= 2 ? "1px solid rgba(255, 255, 255, 0.1)" : void 0,
					color: "#f8fafc",
					scrollMarginTop: "2rem"
				},
				children: renderInlineMarkdown(text, onLinkClick)
			}, `heading-${blockKey++}`));
			i++;
			continue;
		}
		if (/^(\*{3,}|-{3,}|_{3,})$/.test(trimmed)) {
			elements.push(/* @__PURE__ */ jsx("hr", { style: {
				border: "none",
				borderTop: "1px solid rgba(255, 255, 255, 0.12)",
				margin: "1.5rem 0"
			} }, `hr-${blockKey++}`));
			i++;
			continue;
		}
		if (trimmed.startsWith(">")) {
			const quoteLines = [];
			while (i < lines.length && lines[i].trim().startsWith(">")) {
				quoteLines.push(lines[i].trim().slice(1).trim());
				i++;
			}
			elements.push(/* @__PURE__ */ jsx("blockquote", {
				style: {
					margin: "0.75rem 0",
					padding: "0.5rem 1rem",
					borderLeft: "4px solid #6366f1",
					background: "rgba(99, 102, 241, 0.08)",
					borderRadius: "0 6px 6px 0",
					color: "#cbd5e1",
					fontStyle: "italic"
				},
				children: quoteLines.map((ql, qIdx) => /* @__PURE__ */ jsx("p", {
					style: { margin: "0.25rem 0" },
					children: renderInlineMarkdown(ql, onLinkClick)
				}, qIdx))
			}, `quote-${blockKey++}`));
			continue;
		}
		if (trimmed.includes("|") && trimmed.startsWith("|")) {
			const tableLines = [];
			while (i < lines.length && lines[i].trim().includes("|") && lines[i].trim().startsWith("|")) {
				tableLines.push(lines[i].trim());
				i++;
			}
			if (tableLines.length >= 2) {
				const headerRow = tableLines[0].slice(1, -1).split("|").map((c) => c.trim());
				const bodyRows = tableLines.slice(2).map((r) => r.slice(1, -1).split("|").map((c) => c.trim()));
				elements.push(/* @__PURE__ */ jsx("div", {
					style: {
						margin: "1rem 0",
						overflowX: "auto",
						borderRadius: "6px",
						border: "1px solid rgba(255, 255, 255, 0.1)"
					},
					children: /* @__PURE__ */ jsxs("table", {
						style: {
							width: "100%",
							borderCollapse: "collapse",
							fontSize: "0.875rem",
							textAlign: "left"
						},
						children: [/* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsx("tr", {
							style: { background: "rgba(255, 255, 255, 0.05)" },
							children: headerRow.map((h, hIdx) => /* @__PURE__ */ jsx("th", {
								style: {
									padding: "0.6rem 0.8rem",
									borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
									fontWeight: 600,
									color: "#f1f5f9"
								},
								children: renderInlineMarkdown(h, onLinkClick)
							}, hIdx))
						}) }), /* @__PURE__ */ jsx("tbody", { children: bodyRows.map((row, rIdx) => /* @__PURE__ */ jsx("tr", {
							style: {
								borderBottom: "1px solid rgba(255, 255, 255, 0.05)",
								background: rIdx % 2 === 1 ? "rgba(255, 255, 255, 0.02)" : "transparent"
							},
							children: row.map((cell, cIdx) => /* @__PURE__ */ jsx("td", {
								style: {
									padding: "0.5rem 0.8rem",
									color: "#cbd5e1"
								},
								children: renderInlineMarkdown(cell, onLinkClick)
							}, cIdx))
						}, rIdx)) })]
					})
				}, `table-${blockKey++}`));
				continue;
			}
		}
		if (/^(\*|-|\+|\d+\.)\s+/.test(trimmed)) {
			const listItems = [];
			const isOrdered = /^\d+\./.test(trimmed);
			while (i < lines.length && /^(\*|-|\+|\d+\.)\s+/.test(lines[i].trim())) {
				const content = lines[i].trim().replace(/^(\*|-|\+|\d+\.)\s+/, "");
				const taskMatch = content.match(/^\[([ xX])\]\s+(.*)$/);
				if (taskMatch) listItems.push({
					isTask: true,
					checked: taskMatch[1].toLowerCase() === "x",
					text: taskMatch[2]
				});
				else listItems.push({ text: content });
				i++;
			}
			const ListTag = isOrdered ? "ol" : "ul";
			elements.push(/* @__PURE__ */ jsx(ListTag, {
				style: {
					margin: "0.5rem 0",
					paddingLeft: "1.5rem",
					color: "#e2e8f0",
					lineHeight: 1.6
				},
				children: listItems.map((li, liIdx) => /* @__PURE__ */ jsxs("li", {
					style: {
						listStyleType: li.isTask ? "none" : void 0,
						marginLeft: li.isTask ? "-1.2rem" : void 0,
						display: li.isTask ? "flex" : void 0,
						alignItems: li.isTask ? "center" : void 0,
						gap: li.isTask ? "0.5rem" : void 0
					},
					children: [li.isTask && /* @__PURE__ */ jsx("input", {
						type: "checkbox",
						checked: li.checked,
						readOnly: true,
						style: {
							accentColor: "#6366f1",
							cursor: "default"
						}
					}), /* @__PURE__ */ jsx("span", { children: renderInlineMarkdown(li.text, onLinkClick) })]
				}, liIdx))
			}, `list-${blockKey++}`));
			continue;
		}
		const paraLines = [];
		while (i < lines.length && lines[i].trim() && !lines[i].trim().startsWith("```") && !lines[i].trim().startsWith("#") && !lines[i].trim().startsWith(">") && !/^(\*|-|\+|\d+\.)\s+/.test(lines[i].trim()) && !lines[i].trim().startsWith("|")) {
			paraLines.push(lines[i].trim());
			i++;
		}
		if (paraLines.length > 0) elements.push(/* @__PURE__ */ jsx("p", {
			style: {
				margin: "0.6rem 0",
				lineHeight: 1.7,
				color: "#e2e8f0",
				fontSize: "0.95rem"
			},
			children: renderInlineMarkdown(paraLines.join(" "), onLinkClick)
		}, `p-${blockKey++}`));
	}
	return /* @__PURE__ */ jsx("div", { children: elements });
}
function MarkdownViewport({ item, scale, controllerRef, api }) {
	const [text, setText] = useState("");
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState(null);
	const [showOutline, setShowOutline] = useState(false);
	const containerRef = useRef(null);
	useEffect(() => {
		controllerRef.current = {
			scale,
			setScale: () => {},
			actualSize: () => {},
			zoomToFit: () => {}
		};
		return () => {
			controllerRef.current = null;
		};
	}, [controllerRef, scale]);
	useEffect(() => {
		let canceled = false;
		setLoading(true);
		setError(null);
		const loadContent = async () => {
			try {
				const fileHandle = api.getOriginalFile();
				let content = "";
				if (fileHandle.fetchText) content = await fileHandle.fetchText();
				else content = await (await fileHandle.fetchBlob()).text();
				if (!canceled) {
					setText(content);
					setLoading(false);
				}
			} catch (err) {
				if (!canceled) {
					setError(err instanceof Error ? err.message : "Failed to load Markdown file");
					setLoading(false);
				}
			}
		};
		loadContent();
		return () => {
			canceled = true;
		};
	}, [item.id, api]);
	const { frontmatter, body } = useMemo(() => parseFrontmatterAndBody(text), [text]);
	const outline = useMemo(() => extractOutline(body), [body]);
	const stats = useMemo(() => {
		const words = body.trim().split(/\s+/).filter(Boolean).length;
		return {
			words,
			chars: body.length,
			readTimeMinutes: Math.max(1, Math.ceil(words / 200))
		};
	}, [body]);
	const handleLinkClick = useCallback((url) => {
		if (url.startsWith("#")) document.getElementById(url.slice(1))?.scrollIntoView({ behavior: "smooth" });
		else api.openExternalURL(url);
	}, [api]);
	return /* @__PURE__ */ jsxs("div", {
		ref: containerRef,
		style: {
			display: "flex",
			flexDirection: "column",
			height: "100%",
			width: "100%",
			background: "#0c0d11",
			color: "#f1f5f9",
			overflow: "hidden",
			position: "relative"
		},
		children: [/* @__PURE__ */ jsxs("div", {
			style: {
				display: "flex",
				alignItems: "center",
				justifyContent: "space-between",
				padding: "0.5rem 1rem",
				background: "rgba(255, 255, 255, 0.03)",
				borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
				fontSize: "0.75rem",
				color: "#94a3b8",
				userSelect: "none"
			},
			children: [/* @__PURE__ */ jsxs("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: "0.75rem"
				},
				children: [
					/* @__PURE__ */ jsx("span", {
						style: {
							fontWeight: 600,
							color: "#f8fafc"
						},
						children: item.name
					}),
					/* @__PURE__ */ jsx("span", { children: "•" }),
					/* @__PURE__ */ jsxs("span", { children: [stats.words.toLocaleString(), " words"] }),
					/* @__PURE__ */ jsx("span", { children: "•" }),
					/* @__PURE__ */ jsxs("span", { children: [
						"~",
						stats.readTimeMinutes,
						" min read"
					] })
				]
			}), /* @__PURE__ */ jsxs("div", {
				style: {
					display: "flex",
					alignItems: "center",
					gap: "0.5rem"
				},
				children: [
					outline.length > 0 && /* @__PURE__ */ jsxs("button", {
						onClick: () => setShowOutline(!showOutline),
						style: {
							background: showOutline ? "rgba(99, 102, 241, 0.2)" : "rgba(255, 255, 255, 0.06)",
							border: "1px solid rgba(255, 255, 255, 0.1)",
							color: showOutline ? "#a5b4fc" : "#cbd5e1",
							padding: "3px 8px",
							borderRadius: "5px",
							cursor: "pointer",
							fontSize: "0.75rem"
						},
						children: [
							"Outline (",
							outline.length,
							")"
						]
					}),
					/* @__PURE__ */ jsx("button", {
						onClick: () => api.openWithDefaultApp(),
						style: {
							background: "rgba(255, 255, 255, 0.06)",
							border: "1px solid rgba(255, 255, 255, 0.1)",
							color: "#cbd5e1",
							padding: "3px 8px",
							borderRadius: "5px",
							cursor: "pointer",
							fontSize: "0.75rem"
						},
						children: "Open in Editor"
					}),
					/* @__PURE__ */ jsx("button", {
						onClick: () => api.revealInFinder(),
						style: {
							background: "rgba(255, 255, 255, 0.06)",
							border: "1px solid rgba(255, 255, 255, 0.1)",
							color: "#cbd5e1",
							padding: "3px 8px",
							borderRadius: "5px",
							cursor: "pointer",
							fontSize: "0.75rem"
						},
						children: "Reveal"
					})
				]
			})]
		}), /* @__PURE__ */ jsxs("div", {
			style: {
				display: "flex",
				flex: 1,
				overflow: "hidden"
			},
			children: [showOutline && outline.length > 0 && /* @__PURE__ */ jsxs("div", {
				style: {
					width: "240px",
					borderRight: "1px solid rgba(255, 255, 255, 0.08)",
					background: "rgba(15, 17, 23, 0.95)",
					overflowY: "auto",
					padding: "1rem",
					fontSize: "0.8rem"
				},
				children: [/* @__PURE__ */ jsx("div", {
					style: {
						fontWeight: 600,
						color: "#94a3b8",
						textTransform: "uppercase",
						letterSpacing: "0.05em",
						marginBottom: "0.75rem",
						fontSize: "0.7rem"
					},
					children: "Document Outline"
				}), outline.map((o, idx) => /* @__PURE__ */ jsx("a", {
					href: `#${o.id}`,
					onClick: (e) => {
						e.preventDefault();
						handleLinkClick(`#${o.id}`);
					},
					style: {
						display: "block",
						padding: "0.25rem 0",
						paddingLeft: `${(o.level - 1) * .75}rem`,
						color: "#cbd5e1",
						textDecoration: "none",
						whiteSpace: "nowrap",
						overflow: "hidden",
						textOverflow: "ellipsis"
					},
					children: o.text
				}, idx))]
			}), /* @__PURE__ */ jsx("div", {
				style: {
					flex: 1,
					overflowY: "auto",
					padding: "2rem",
					display: "flex",
					justifyContent: "center"
				},
				children: /* @__PURE__ */ jsx("div", {
					style: {
						width: "100%",
						maxWidth: "800px",
						transform: scale !== 1 ? `scale(${scale})` : void 0,
						transformOrigin: "top center",
						transition: "transform 0.1s ease-out"
					},
					children: loading ? /* @__PURE__ */ jsx("div", {
						style: {
							textAlign: "center",
							padding: "4rem 0",
							color: "#94a3b8"
						},
						children: "Loading Markdown..."
					}) : error ? /* @__PURE__ */ jsx("div", {
						style: {
							padding: "1.5rem",
							borderRadius: "8px",
							background: "rgba(239, 68, 68, 0.1)",
							border: "1px solid rgba(239, 68, 68, 0.3)",
							color: "#f87171"
						},
						children: error
					}) : /* @__PURE__ */ jsxs(Fragment, { children: [frontmatter && Object.keys(frontmatter).length > 0 && /* @__PURE__ */ jsxs("div", {
						style: {
							marginBottom: "1.5rem",
							padding: "1rem",
							borderRadius: "8px",
							background: "rgba(255, 255, 255, 0.03)",
							border: "1px solid rgba(255, 255, 255, 0.08)",
							fontSize: "0.85rem"
						},
						children: [
							frontmatter.title && /* @__PURE__ */ jsx("h1", {
								style: {
									margin: "0 0 0.5rem 0",
									fontSize: "1.5rem",
									color: "#f8fafc"
								},
								children: String(frontmatter.title)
							}),
							frontmatter.description && /* @__PURE__ */ jsx("p", {
								style: {
									margin: "0 0 0.5rem 0",
									color: "#94a3b8"
								},
								children: String(frontmatter.description)
							}),
							/* @__PURE__ */ jsxs("div", {
								style: {
									display: "flex",
									flexWrap: "wrap",
									gap: "0.5rem",
									marginTop: "0.5rem"
								},
								children: [
									frontmatter.author && /* @__PURE__ */ jsxs("span", {
										style: { color: "#64748b" },
										children: ["By ", String(frontmatter.author)]
									}),
									frontmatter.date && /* @__PURE__ */ jsxs("span", {
										style: { color: "#64748b" },
										children: ["• ", String(frontmatter.date)]
									}),
									Array.isArray(frontmatter.tags) && frontmatter.tags.map((t, idx) => /* @__PURE__ */ jsxs("span", {
										style: {
											background: "rgba(99, 102, 241, 0.15)",
											color: "#818cf8",
											borderRadius: "4px",
											padding: "1px 6px",
											fontSize: "0.75rem"
										},
										children: ["#", t]
									}, idx))
								]
							})
						]
					}), /* @__PURE__ */ jsx(MarkdownRenderer, {
						body,
						onLinkClick: handleLinkClick
					})] })
				})
			})]
		})]
	});
}
function MarkdownInspectorPreview({ item, api }) {
	const [snippet, setSnippet] = useState("");
	const [stats, setStats] = useState({
		words: 0,
		lines: 0
	});
	useEffect(() => {
		let active = true;
		const fetchSnippet = async () => {
			try {
				const fileHandle = api.getOriginalFile();
				const text = fileHandle.fetchText ? await fileHandle.fetchText() : await (await fileHandle.fetchBlob()).text();
				if (active) {
					const lines = text.split("\n");
					const words = text.trim().split(/\s+/).filter(Boolean).length;
					setStats({
						words,
						lines: lines.length
					});
					setSnippet(lines.slice(0, 8).join("\n"));
				}
			} catch {}
		};
		fetchSnippet();
		return () => {
			active = false;
		};
	}, [item.id, api]);
	return /* @__PURE__ */ jsxs("div", {
		style: {
			padding: "0.85rem",
			background: "rgba(255, 255, 255, 0.02)",
			borderRadius: "8px",
			border: "1px solid rgba(255, 255, 255, 0.08)",
			fontSize: "0.8rem"
		},
		children: [
			/* @__PURE__ */ jsxs("div", {
				style: {
					display: "flex",
					alignItems: "center",
					justifyContent: "space-between",
					marginBottom: "0.5rem"
				},
				children: [/* @__PURE__ */ jsx("span", {
					style: {
						fontWeight: 600,
						textTransform: "uppercase",
						fontSize: "0.7rem",
						color: "#818cf8",
						letterSpacing: "0.05em"
					},
					children: "Markdown Document"
				}), /* @__PURE__ */ jsxs("span", {
					style: {
						color: "#64748b",
						fontSize: "0.75rem"
					},
					children: [
						stats.words,
						" words • ",
						stats.lines,
						" lines"
					]
				})]
			}),
			/* @__PURE__ */ jsx("pre", {
				style: {
					margin: "0.5rem 0",
					padding: "0.6rem",
					background: "rgba(0, 0, 0, 0.3)",
					borderRadius: "6px",
					color: "#94a3b8",
					fontSize: "0.75rem",
					fontFamily: "monospace",
					overflow: "hidden",
					lineHeight: 1.4,
					maxHeight: "130px",
					maskImage: "linear-gradient(to bottom, black 70%, transparent 100%)",
					WebkitMaskImage: "linear-gradient(to bottom, black 70%, transparent 100%)"
				},
				children: snippet || "Loading preview..."
			}),
			/* @__PURE__ */ jsxs("div", {
				style: {
					display: "flex",
					gap: "0.5rem",
					marginTop: "0.75rem"
				},
				children: [/* @__PURE__ */ jsx("button", {
					onClick: () => api.openWithDefaultApp(),
					style: {
						flex: 1,
						padding: "0.35rem 0.5rem",
						background: "rgba(255, 255, 255, 0.06)",
						border: "1px solid rgba(255, 255, 255, 0.1)",
						borderRadius: "5px",
						color: "#e2e8f0",
						fontSize: "0.75rem",
						cursor: "pointer"
					},
					children: "Edit"
				}), /* @__PURE__ */ jsx("button", {
					onClick: () => api.revealInFinder(),
					style: {
						flex: 1,
						padding: "0.35rem 0.5rem",
						background: "rgba(255, 255, 255, 0.06)",
						border: "1px solid rgba(255, 255, 255, 0.1)",
						borderRadius: "5px",
						color: "#e2e8f0",
						fontSize: "0.75rem",
						cursor: "pointer"
					},
					children: "Reveal"
				})]
			})
		]
	});
}
var markdownPreviewPlugin = definePlugin({
	id: "official.markdown-preview",
	name: "Markdown Preview",
	version: "1.0.0",
	description: "Rich Markdown preview with syntax highlighting, task lists, and metadata inspection",
	author: "Bowerbird Team",
	kind: "preview",
	priority: 50,
	extensions: [
		"md",
		"markdown",
		"mdown",
		"mkd",
		"mdwn",
		"mdt"
	],
	mimePrefixes: ["text/markdown", "text/x-markdown"],
	supportsZoom: true,
	Viewport: MarkdownViewport,
	InspectorPreview: MarkdownInspectorPreview
});
//#endregion
export { markdownPreviewPlugin as default, markdownPreviewPlugin as plugin };
