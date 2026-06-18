import path from "path"
import { defineConfig } from "prisma/config"
import { PrismaLibSql } from "@prisma/adapter-libsql"

const dbUrl = `file://${path.resolve("prisma/dev.db")}`

export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: dbUrl,
    adapter: () => new PrismaLibSql({ url: dbUrl }),
  },
})
