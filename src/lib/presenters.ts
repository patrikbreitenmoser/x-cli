function normalizeRequestedFields(fields: string | undefined): Set<string> {
  if (!fields) {
    return new Set();
  }
  return new Set(
    fields
      .split(',')
      .map((field) => field.trim())
      .filter((field) => field.length > 0),
  );
}

export function parseRequestedFields(fields: string | undefined, includeFull: boolean, defaults: string[]): Set<string> {
  const requested = normalizeRequestedFields(fields);
  defaults.forEach((field) => requested.add(field));
  if (includeFull) {
    requested.add('*');
  }
  return requested;
}

export function summarizeUser(
  user: any,
  options: {
    requestedFields: Set<string>;
  },
): Record<string, unknown> {
  const wantsAll = options.requestedFields.has('*');
  const summary: Record<string, unknown> = {
    id: user.id,
    username: user.username,
  };

  if (wantsAll || options.requestedFields.has('url')) {
    summary.url = user.url ?? null;
  }
  if (wantsAll || options.requestedFields.has('description')) {
    summary.description = user.description ?? null;
  }

  return summary;
}

export function summarizeTweet(
  tweet: any,
  options: {
    requestedFields: Set<string>;
    author?: string;
  },
): Record<string, unknown> {
  const wantsAll = options.requestedFields.has('*');
  const author = options.author ?? tweet.author_id ?? 'unknown';
  const text = tweet.note_tweet?.text ?? tweet.text ?? '';
  const summary: Record<string, unknown> = {
    id: tweet.id,
    author,
    created_at: tweet.created_at ?? null,
    text: wantsAll || options.requestedFields.has('text') ? text : truncateText(text),
  };

  if (wantsAll || options.requestedFields.has('conversation_id')) {
    summary.conversation_id = tweet.conversation_id ?? null;
  }
  if (wantsAll || options.requestedFields.has('referenced_tweets')) {
    summary.referenced_tweets = tweet.referenced_tweets ?? [];
  }
  if (wantsAll || options.requestedFields.has('attachments')) {
    summary.attachments = tweet.attachments ?? null;
  }
  if (wantsAll || options.requestedFields.has('url')) {
    summary.url = `https://x.com/${author}/status/${tweet.id}`;
  }

  return summary;
}

export function truncateText(text: string, maxLength: number = 280): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}
