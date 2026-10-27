// Help content is intentionally static and does not claim live Riot connectivity.
export const guideTopics = {
  overview: {
    title: 'UFO Bot · Command Guide',
    description: 'Your VALORANT-themed Discord companion. Community features work without Riot API access.',
    fields: [
      { name: 'Identity', value: '/link · /profile · /claim-rank · /sync · /unlink' },
      { name: 'Find a squad', value: '/lfg · /lfg-close · /tempvoice · /tempvoice-close' },
      { name: 'Community', value: '/xp · /leaderboard · /setbio · /server-profile · /reset-profile' },
      { name: 'Utilities', value: '/help topic:… · /bot-status' }
    ]
  },
  identity: {
    title: 'UFO Bot · Identity & Rank',
    description: 'Your Riot ID association is voluntary and does NOT prove account ownership.',
    fields: [
      { name: 'Get started', value: '/link riot_id:Name#TAG region:americas — save an ID. A permitted account lookup may confirm that the ID exists.' },
      { name: 'Your profile', value: '/profile [user] — show Riot ID, region, rank claim and trust labels.' },
      { name: 'Rank claims', value: '/claim-rank — self-report a rank, clearly labeled unverified. Staff can use /verify-rank after reviewing evidence; this is NOT Riot verification.' },
      { name: 'Refresh or remove', value: '/sync — attempt an account-ID existence check only. /unlink — remove Riot association, rank claim and agent selections.' }
    ]
  },
  squad: {
    title: 'UFO Bot · Find Your Squad',
    description: 'Organize a party without granting access to your Riot account.',
    fields: [
      { name: 'LFG', value: '/lfg mode:Competitive spots:2 notes:… — post your listing. /lfg-close removes the active listing.' },
      { name: 'Agent roles', value: 'Staff posts /setup-agents; select your main agents from Discord menus.' },
      { name: 'Temporary voice', value: '/tempvoice [name] [limit] opens a room; /tempvoice-close closes it when empty.' },
      { name: 'Server setup', value: 'Permissions and dashboard configuration determine which community features are enabled.' }
    ]
  },
  progress: {
    title: 'UFO Bot · XP & Profiles',
    description: 'Server participation XP is a community feature, not Riot gameplay statistics.',
    fields: [
      { name: 'Progression', value: '/xp [user] — see level and XP. /leaderboard — see the server leaderboard.' },
      { name: 'Player bio', value: '/setbio bio:… — set a public Discord-server bio. /server-profile [user] displays it.' },
      { name: 'Delete community data', value: '/reset-profile — delete your XP and bio. /unlink separately clears Riot association and rank roles.' }
    ]
  },
  staff: {
    title: 'UFO Bot · Staff & Trust',
    description: 'Rank staff checks are human attestations, never Riot OAuth or competitive rank API verification.',
    fields: [
      { name: 'Role setup', value: '/setup-agents requires Manage Server; the bot also needs Manage Roles and correct role hierarchy.' },
      { name: 'Rank checks', value: '/verify-rank requires Manage Roles and an independently reviewed claim; it is labeled staff checked.' },
      { name: 'Operator dashboard', value: 'Settings can be saved locally. Saving does not prove a bot, Hub or Riot connection. Admin access must remain private.' },
      { name: 'Riot development keys', value: 'Development keys expire every 24 hours. For VALORANT player-stat/RSO flows, seek Riot production approval and explicit player consent.' }
    ]
  }
};

export function guideFor(topic) {
  return guideTopics[topic] || guideTopics.overview;
}

export function riotLookupExplanation(status) {
  const messages = {
    not_configured: 'Riot account lookup is not configured; the ID was not checked.',
    key_expired_or_invalid: 'Riot rejected the key (often an expired 24-hour development key); the ID was not checked.',
    access_denied: 'This Riot key is not authorized for the requested API; the ID was not checked.',
    rate_limited: 'Riot rate-limited the lookup; the ID was not checked.',
    service_unavailable: 'Riot is temporarily unavailable; the ID was not checked.',
    network_error: 'The Riot lookup could not connect; the ID was not checked.',
    invalid_response: 'Riot returned a response this bot could not validate; the ID was not checked.',
    lookup_error: 'The Riot lookup was unsuccessful; the ID was not checked.',
    invalid_input: 'The Riot ID or routing region is invalid; the ID was not checked.'
  };
  return messages[status] || 'The account identifier was not checked.';
}

export function riotKeySummary(configured) {
  return configured
    ? 'Key present in process configuration. Validity, access and remaining lifetime are NOT verified. Development keys typically expire after 24 hours.'
    : 'No Riot API key configured. Community commands and voluntary, unverified Riot ID associations still work.';
}
