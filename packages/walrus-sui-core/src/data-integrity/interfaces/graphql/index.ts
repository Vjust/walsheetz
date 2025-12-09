/**
 * GraphQL interfaces barrel export
 * Provides standardized types for Walrus blob queries and PoA status
 */

// Re-export from main interfaces directory
export { IBlobRecord, default as BlobRecord } from "../../../interfaces/graphql/IBlobRecord.js";
export { IPoAStatus, default as PoAStatus } from "../../../interfaces/graphql/IPoAStatus.js";
export { IGraphQLResponse, default as GraphQLResponse } from "./IGraphQLResponse.js";