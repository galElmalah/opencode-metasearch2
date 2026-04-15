---
name: research
description: Perform deep research on a topic using web search, file reading, and synthesis into a structured report
---

# Research

Conduct thorough research on a given topic by combining web search results with local context and produce a structured, actionable report.

## When to use

- User asks to research a topic, technology, library, or concept
- User needs a comparison of options or approaches
- User wants to understand the state of the art on something
- User asks "what's the best way to..." or "how do others handle..."

## Workflow

### 1. Clarify scope

Before searching, identify:
- **What** exactly to research (narrow the topic)
- **Why** the user needs it (decision, implementation, learning)
- **Depth** needed (quick overview vs deep dive)

If the topic is ambiguous, ask one clarifying question before proceeding.

### 2. Search

Use the `web_search` tool to query from multiple angles. Run at least 3 searches with varied queries:

- **Direct query**: the topic as stated
- **Comparison query**: "X vs Y" or "X alternatives"
- **Implementation query**: "X best practices" or "how to X in [language/framework]"
- **Recency query**: "X 2025" or "X latest" to get current information

Review results and follow up with additional targeted searches if initial results are thin or surface-level.

### 3. Read and cross-reference

- If search results reference specific documentation, repos, or articles, use `web_fetch` to read the most relevant ones (up to 3)
- If the topic relates to code in the current project, read relevant local files for context
- Cross-reference claims across multiple sources -- flag contradictions

### 4. Synthesize

Produce a structured report with these sections:

```
## Summary
One paragraph TL;DR answering the core question.

## Key findings
Bulleted list of the most important facts, ranked by relevance.

## Options / Approaches
(If applicable) Table or list comparing alternatives with trade-offs.

## Recommendation
What to do, based on the findings and the user's context.

## Sources
Numbered list of URLs consulted.
```

### 5. Adapt format to depth

- **Quick research** (user wants a fast answer): Summary + Key findings + Sources. Skip the rest.
- **Deep research** (user wants thorough analysis): All sections. Include code examples if relevant.

## Guidelines

- Prefer primary sources (official docs, RFCs, author posts) over secondary (blog roundups, SEO content)
- Always include dates or version numbers when findings are time-sensitive
- If the research reveals the user's current approach has issues, say so directly
- Do not pad the report -- if 3 bullet points cover it, don't write 10
- If web search is unavailable, state it and work with what you have (local files, your training data) rather than silently guessing
