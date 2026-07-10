export interface McpToolDef {
  name: string
  description: string
  inputSchema: Record<string, unknown>
}

export interface McpToolResult {
  content: Array<{
    type: 'text'
    text: string
  }>
  isError?: boolean
}

export interface PaginatedResult<T> {
  items: T[]
  totalCount: number
  limit: number
  offset: number
  hasMore: boolean
}

export interface PaginationParams {
  limit?: number
  offset?: number
}

export interface SearchResourcesParams extends PaginationParams {
  query?: string
  category?: string
  usedByRecipe?: string
  producedByRecipe?: string
  neededForFacility?: string
  neededForTech?: string
}

export interface SearchRecipesParams extends PaginationParams {
  outputResource?: string
  inputResource?: string
  facilityType?: string
  techRequired?: string
  unlockedOnly?: boolean
}

export interface SearchFacilitiesParams extends PaginationParams {
  type?: string
  status?: string
  producesResource?: string
  consumesResource?: string
  nearLat?: number
  nearLon?: number
  radiusKm?: number
}
