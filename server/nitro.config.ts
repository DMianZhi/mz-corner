import { defineNitroConfig } from 'nitropack/config'
import { config } from 'dotenv'

config()

export default defineNitroConfig({
  compatibilityDate: '2026-04-23',
  publicAssets: [
    {
      dir: '../client/dist',
      baseURL: '/',
      maxAge: 0,
    },
  ],
  runtimeConfig: {
    logLevel: '3',
    projectId: '',
    appBaseEndpoint: '<endpoint>',
    nitro: {
      envPrefix: '',
    },
  },
})
