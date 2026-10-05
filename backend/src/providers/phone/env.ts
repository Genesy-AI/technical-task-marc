import { existsSync } from 'fs'
import path from 'path'

const envFile = path.resolve(__dirname, '../../../.env')
if (existsSync(envFile)) process.loadEnvFile(envFile)

export const env = (name: string, fallback: string) => process.env[name] || fallback
