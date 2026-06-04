import { GoogleAdsApi } from 'google-ads-api'

function getClient() {
  return new GoogleAdsApi({
    client_id: process.env.GOOGLE_ADS_CLIENT_ID!,
    client_secret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
    developer_token: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
  })
}

export async function runGaqlQuery(
  customerId: string,
  loginCustomerId: string,
  query: string
): Promise<object[]> {
  const client = getClient()
  const customer = client.Customer({
    customer_id: customerId.replace(/-/g, ''),
    login_customer_id: loginCustomerId.replace(/-/g, ''),
    refresh_token: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
  })
  const results = await customer.query(query)
  return results as object[]
}
