import { handle } from '../lib/release.js'

// GITHUB_TOKEN e optional: fara el, GitHub permite 60 de cereri pe ora, iar CDN-ul oricum le rareste.
export function GET(request) {
  return handle(request, { token: process.env.GITHUB_TOKEN })
}
