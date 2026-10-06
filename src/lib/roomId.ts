import { customAlphabet } from 'nanoid';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const generate = customAlphabet(ALPHABET, 8);

export function createRoomId(): string {
  return `wt-${generate()}`;
}