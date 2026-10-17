# Outreach Pipeline

A reusable outreach skill: guided campaign intake, a Markdown CRM, Exa lead discovery, user qualification, Intent-generated messages, review before sending, and activity tracking.

## Install

```sh
npx skills add randomUser00/outreach-pipeline --skill outreach-pipeline
```

Then ask your agent: “Use outreach-pipeline to set up my campaign.”

## Connections

Built for Codex; other agents need equivalent tools. Installation does not connect your accounts. The skill guides you through choosing your Gmail sender, signing into LinkedIn in the browser when needed, and connecting your own Intent MCP endpoint and token. Exa tools are required for lead discovery. The optional Intent helper uses the Codex CLI and supports macOS Keychain.

Start with a brief or answer one question at a time. You qualify leads and approve each exact message before it is sent. Read status stays unknown unless the channel provides evidence. Background tracking requires an available scheduler and explicit setup.

Intent may retain submitted content and use it to improve its service; the skill explains this before submitting writing samples.

## Contents

The reusable skill is in [skills/outreach-pipeline](skills/outreach-pipeline/SKILL.md). No personal campaign, CRM records, account credentials, or sender examples are included.
