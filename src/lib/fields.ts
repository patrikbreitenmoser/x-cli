import type { TTweetv2TweetField, TTweetv2Expansion, TTweetv2UserField, TTweetv2MediaField } from 'twitter-api-v2';

export const TWEET_FIELDS: TTweetv2TweetField[] = [
  'author_id',
  'created_at',
  'conversation_id',
  'attachments',
  'referenced_tweets',
  'entities',
  'note_tweet',
];

export const TWEET_EXPANSIONS: TTweetv2Expansion[] = [
  'author_id',
  'attachments.media_keys',
  'attachments.poll_ids',
  'referenced_tweets.id',
  'referenced_tweets.id.author_id',
];

export const USER_FIELDS: TTweetv2UserField[] = [
  'username',
  'url',
  'description',
];

export const MEDIA_FIELDS: TTweetv2MediaField[] = [
  'type',
  'url',
  'preview_image_url',
  'alt_text',
  'variants',
  'width',
  'height',
  'duration_ms',
];
