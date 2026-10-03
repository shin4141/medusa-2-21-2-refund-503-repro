import crypto from "node:crypto"
import {
  AbstractPaymentProvider,
  PaymentActions,
  PaymentSessionStatus,
} from "@medusajs/framework/utils"

export default class V38GatewayProvider extends AbstractPaymentProvider<Record<string, never>> {
  static identifier = "v38gateway"

  async initiatePayment(_input: any) {
    return { data: {}, id: crypto.randomUUID() }
  }
  async authorizePayment(_input: any) {
    return { data: {}, status: PaymentSessionStatus.AUTHORIZED }
  }
  async getPaymentStatus(_input: any) {
    return PaymentSessionStatus.AUTHORIZED
  }
  async capturePayment(_input: any) {
    return { data: {} }
  }
  async refundPayment(input: any) {
    const gatewayUrl = process.env.V38_GATEWAY_URL
    if (!gatewayUrl) {
      throw new Error("synthetic local gateway URL missing")
    }
    const response = await fetch(gatewayUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: input.amount }),
    })
    if (!response.ok) {
      throw new Error(`synthetic local gateway HTTP ${response.status}`)
    }
    return { data: { ...(input.data ?? {}), local_gateway_accepted: true } }
  }
  async cancelPayment(input: any) {
    return { data: input.data ?? {} }
  }
  async deletePayment(input: any) {
    return { data: input.data ?? {} }
  }
  async updatePayment(input: any) {
    return { data: input.data ?? {} }
  }
  async retrievePayment(input: any) {
    return { data: input.data ?? {} }
  }
  async getWebhookActionAndData(_input: any) {
    return { action: PaymentActions.NOT_SUPPORTED }
  }
}
