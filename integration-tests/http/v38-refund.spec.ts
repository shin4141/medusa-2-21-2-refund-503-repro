import { medusaIntegrationTestRunner } from "@medusajs/test-utils"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import {
  createPaymentSessionsWorkflow,
  refundPaymentsWorkflow,
} from "@medusajs/core-flows"
import { createServer } from "node:http"
import type { AddressInfo } from "node:net"

jest.setTimeout(120000)

medusaIntegrationTestRunner({
  testSuite: ({ getContainer }) => {
    it("v38 local provider failure and success control", async () => {
      const container = getContainer()
      const paymentModule: any = container.resolve(Modules.PAYMENT)
      const orderModule: any = container.resolve(Modules.ORDER)
      const remoteLink: any = container.resolve(ContainerRegistrationKeys.LINK)

      const setup = async (label: string) => {
        const order = await orderModule.createOrders({
          region_id: "reg_v38_synthetic",
          currency_code: "usd",
          email: `v38-${label}@example.invalid`,
          items: [{ title: `Synthetic ${label}`, quantity: 1, unit_price: 100 }],
          sales_channel_id: "sc_v38_synthetic",
        })
        const collection = await paymentModule.createPaymentCollections({
          currency_code: "usd",
          amount: 100,
        })
        await remoteLink.create({
          [Modules.ORDER]: { order_id: order.id },
          [Modules.PAYMENT]: { payment_collection_id: collection.id },
        })
        await createPaymentSessionsWorkflow(container).run({
          input: {
            payment_collection_id: collection.id,
            provider_id: "pp_v38gateway_local",
            context: {},
            data: {},
          },
        })
        const updatedCollection = await paymentModule.retrievePaymentCollection(
          collection.id,
          { relations: ["payment_sessions"] }
        )
        const session = updatedCollection.payment_sessions[0]
        const payment = await paymentModule.authorizePaymentSession(session.id, {})
        await paymentModule.capturePayment({ payment_id: payment.id })
        return { order, payment, session }
      }

      const observe = async (label: string, setupResult: any) => {
        const { order, payment, session } = setupResult
        const { result } = await refundPaymentsWorkflow(container).run({
          input: [{ payment_id: payment.id, amount: 50 }],
        })
        const transactions = await orderModule.listOrderTransactions({
          order_id: order.id,
        })
        const persistedPayment = await paymentModule.retrievePayment(payment.id, {
          relations: ["refunds"],
        })
        return {
          label,
          workflowResultCount: result.length,
          providerId: session.provider_id,
          persistedRefundCount: persistedPayment.refunds?.length ?? 0,
          transactions: transactions.map((transaction: any) => ({
            amount: transaction.amount,
            reference: transaction.reference,
            reference_id: transaction.reference_id,
          })),
        }
      }

      let gatewayStatus = 503
      const gatewayCalls: number[] = []
      const gateway = createServer((_request, response) => {
        gatewayCalls.push(gatewayStatus)
        response.writeHead(gatewayStatus, { "content-type": "application/json" })
        response.end("{}")
      })
      await new Promise<void>((resolve) => gateway.listen(0, "127.0.0.1", resolve))
      const gatewayPort = (gateway.address() as AddressInfo).port
      process.env.V38_GATEWAY_URL = `http://127.0.0.1:${gatewayPort}/refund`

      let failureObservation: any
      let controlObservation: any
      try {
        const failureSetup = await setup("failure")
        failureObservation = await observe("provider-failure", failureSetup)
        gatewayStatus = 200
        const controlSetup = await setup("control")
        controlObservation = await observe("provider-success", controlSetup)
      } finally {
        delete process.env.V38_GATEWAY_URL
        await new Promise<void>((resolve) => gateway.close(() => resolve()))
      }

      console.log("V38_OBSERVATION=" + JSON.stringify({ failureObservation, controlObservation, gatewayCalls }))
      expect(gatewayCalls).toEqual([503, 200])
      expect(failureObservation.workflowResultCount).toBe(0)
      expect(failureObservation.persistedRefundCount).toBe(0)
      expect(failureObservation.transactions).toHaveLength(1)
      expect(controlObservation.workflowResultCount).toBe(1)
      expect(controlObservation.persistedRefundCount).toBe(1)
      expect(controlObservation.transactions).toHaveLength(1)
    })
  },
})
