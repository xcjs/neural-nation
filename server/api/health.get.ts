import { defineEventHandler } from 'h3'

export default defineEventHandler(() => {
  return {
    status: 'ok',
    uptime: process.uptime(),
    games: 0,
  }
})