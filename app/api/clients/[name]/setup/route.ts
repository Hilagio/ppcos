import { getClient } from '@/lib/clients'
import { runGaqlQuery } from '@/lib/google-ads'

export async function GET(_req: Request, { params }: { params: { name: string } }) {
  const client = getClient(params.name)
  if (!client) return new Response('Client not found', { status: 404 })

  try {
    const cid = client.customerId.toString()
    const lcid = client.loginCustomerId.toString()

    const [campaignRows, convRows, custRows] = await Promise.all([
      runGaqlQuery(cid, lcid,
        `SELECT campaign.name, campaign.advertising_channel_type, campaign.status,
                campaign.bidding_strategy_type,
                metrics.cost_micros, metrics.conversions, metrics.conversion_value
         FROM campaign
         WHERE campaign.status IN ('ENABLED','PAUSED')
           AND segments.date DURING LAST_30_DAYS
         ORDER BY metrics.cost_micros DESC`
      ),
      runGaqlQuery(cid, lcid,
        `SELECT conversion_action.name, conversion_action.category,
                conversion_action.value_settings.default_value,
                conversion_action.counting_type,
                conversion_action.include_in_conversions_metric
         FROM conversion_action
         WHERE conversion_action.status = 'ENABLED'`
      ),
      runGaqlQuery(cid, lcid,
        `SELECT customer.currency_code FROM customer LIMIT 1`
      ),
    ])

    const currency: string = (custRows[0] as any)?.customer?.currencyCode ?? 'USD'

    const campaigns = campaignRows.map((row: any) => {
      const cost = (row.metrics?.costMicros ?? 0) / 1_000_000
      const convs = row.metrics?.conversions ?? 0
      const convVal = row.metrics?.conversionValue ?? 0
      return {
        name: row.campaign?.name ?? '',
        type: row.campaign?.advertisingChannelType ?? '',
        status: row.campaign?.status ?? '',
        biddingStrategy: row.campaign?.biddingStrategyType ?? '',
        cost30d: Math.round(cost),
        conversions30d: Math.round(convs * 10) / 10,
        cpa30d: convs > 0 ? Math.round(cost / convs) : null,
        roas30d: cost > 0 ? Math.round((convVal / cost) * 100) / 100 : null,
        label: '',
      }
    })

    const conversionActions = convRows.map((row: any) => ({
      name: row.conversionAction?.name ?? '',
      category: row.conversionAction?.category ?? '',
      defaultValue: row.conversionAction?.valueSettings?.defaultValue ?? 0,
      countingType: row.conversionAction?.countingType ?? '',
      isPrimary: row.conversionAction?.includeInConversionsMetric ?? true,
      include: row.conversionAction?.includeInConversionsMetric ?? true,
      customValue: '',
    }))

    return Response.json({ campaigns, conversionActions, currency })
  } catch (err) {
    return Response.json({ campaigns: [], conversionActions: [], currency: 'USD', error: String(err) })
  }
}
