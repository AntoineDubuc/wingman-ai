# Hume AI — Pricing Reference

> Complete pricing breakdown for budgeting and cost estimation.

---

## Subscription Plans

| Plan | Monthly Cost | Best For |
|------|--------------|----------|
| **Free** | $0 | Evaluation, POC |
| **Starter** | $3 | Development, low-volume testing |
| **Pro** | $70 | Production, moderate usage |
| **Scale** | $200 | High-volume production |
| **Business** | $500 | Enterprise features |
| **Enterprise** | Custom | Large-scale deployments |

---

## Plan Details

### Free Tier

| Feature | Limit |
|---------|-------|
| Credits | $20 one-time |
| Characters (TTS) | 10,000/month (~10 min audio) |
| EVI Minutes | 5 minutes/month |
| Concurrent Connections | 1 |
| Overage | Not available |

### Starter ($3/month)

| Feature | Limit |
|---------|-------|
| Characters | 30,000/month (~30 min audio) |
| EVI Minutes | 40 minutes/month |
| Concurrent Connections | 5 |
| Overage Rate (chars) | $0.12/1K |
| Overage Rate (EVI) | $0.07/min |
| Team Seats | 1 |

### Pro ($70/month)

| Feature | Limit |
|---------|-------|
| Characters | 250,000/month |
| EVI Minutes | 1,200 minutes/month |
| Concurrent Connections | 10 |
| Overage Rate (chars) | $0.08/1K |
| Overage Rate (EVI) | $0.06/min |
| Team Seats | 3 |

### Scale ($200/month)

| Feature | Limit |
|---------|-------|
| Characters | 600,000/month |
| EVI Minutes | 3,000 minutes/month |
| Concurrent Connections | 20 |
| Overage Rate (chars) | $0.05/1K |
| Overage Rate (EVI) | $0.055/min |
| Team Seats | 10 |

### Business ($500/month)

| Feature | Limit |
|---------|-------|
| Characters | 1,500,000/month |
| EVI Minutes | 6,000 minutes/month |
| Concurrent Connections | 30 |
| Overage Rate (chars) | $0.04/1K |
| Overage Rate (EVI) | $0.05/min |
| Team Seats | 30 |

---

## Expression Measurement API Pricing

This is what Wingman AI would use (NOT EVI or TTS).

### Pay-As-You-Go Rates

| Model | Cost | Unit |
|-------|------|------|
| **Prosody (Audio)** | $0.0639 | per minute |
| **Burst (Audio)** | Included with Prosody | — |
| **Face (Video)** | $0.0828 | per minute |
| **Language (Text)** | $0.00024 | per word |
| **Prosody + Face** | $0.0828 | per minute |

### Calculation Example

**30-minute sales call with prosody analysis:**
```
30 minutes × $0.0639/min = $1.92 per call
```

**100 calls per month (30 min avg):**
```
100 calls × $1.92 = $192/month
```

---

## Cost Comparison by Volume

### Low Volume (50 calls/month × 30 min)

| Plan | Base Cost | Overage | Total |
|------|-----------|---------|-------|
| Free | $0 | $96 (at $0.0639/min) | $96 |
| Starter | $3 | $93 | $96 |
| Pro | $70 | $26 | $96 |

**Recommendation**: Free or Starter tier

### Medium Volume (100 calls/month × 30 min)

| Plan | Base Cost | Overage | Total |
|------|-----------|---------|-------|
| Starter | $3 | $189 | $192 |
| Pro | $70 | $122 | $192 |
| Scale | $200 | $0 | $200 |

**Recommendation**: Pro tier (included minutes cover most usage)

### High Volume (300 calls/month × 30 min)

| Plan | Base Cost | Overage | Total |
|------|-----------|---------|-------|
| Pro | $70 | $506 | $576 |
| Scale | $200 | $291 | $491 |
| Business | $500 | $45 | $545 |

**Recommendation**: Scale tier

---

## Wingman AI User Scenarios

### Scenario A: Light User
- 10 calls/week (40/month)
- 20 min average call

**Monthly Cost**: 40 × 20 × $0.0639 = **$51.12**

### Scenario B: Active Salesperson
- 5 calls/day (100/month)
- 30 min average call

**Monthly Cost**: 100 × 30 × $0.0639 = **$191.70**

### Scenario C: Power User / SDR
- 10 calls/day (220/month)
- 15 min average call

**Monthly Cost**: 220 × 15 × $0.0639 = **$211.00**

---

## Billing Model

| Aspect | Details |
|--------|---------|
| **Billing Cycle** | Monthly, from subscription start date |
| **Usage Reset** | Monthly on billing date |
| **Overage Billing** | Charged at end of cycle |
| **Payment Methods** | Credit card |
| **Enterprise** | Invoice, custom terms |

---

## Free Trial Strategy

**Recommended approach for Wingman AI:**

1. **Free tier for evaluation**
   - New users get Hume free tier ($20 credits)
   - Enough for ~5 hours of analysis
   - No cost to Wingman during trial

2. **User provides own keys**
   - BYOK model (same as Deepgram/Gemini)
   - User controls their Hume subscription
   - Wingman has zero Hume costs

3. **Optional premium feature**
   - Emotion detection as "Pro" feature
   - Users can disable to avoid costs

---

## Cost Optimization Tips

### 1. Batch Processing for Summaries
Use post-call batch analysis instead of real-time for cost-sensitive users.
- Cheaper per-minute rates
- No WebSocket overhead

### 2. Selective Streaming
Only stream to Hume during active speech:
```typescript
// Only send when speech detected
if (voiceActivityDetected) {
  humeClient.sendAudio(chunk);
}
```

### 3. Sampling Strategy
Analyze every 3rd or 5th audio chunk instead of continuous:
```typescript
let chunkCounter = 0;
const SAMPLE_RATE = 3;

function handleAudioChunk(chunk: ArrayBuffer) {
  chunkCounter++;
  if (chunkCounter % SAMPLE_RATE === 0) {
    humeClient.sendAudio(chunk);
  }
}
```
**Trade-off**: Lower cost, less responsive emotion updates.

### 4. Session-Based Billing
Hume charges per-minute of audio processed:
- Silence doesn't count (audio must contain speech)
- Short calls cost less than long calls

---

## Enterprise Pricing

For high-volume deployments, contact Hume directly:

- **Custom pricing** based on volume
- **Committed usage discounts**
- **Dedicated support**
- **SLA guarantees**
- **Custom data retention**

Contact: https://www.hume.ai/contact

---

## Comparison: Hume vs Alternatives

| Provider | Real-Time | Cost/Min | Emotions |
|----------|-----------|----------|----------|
| **Hume AI** | Yes | $0.064 | 48 dimensions |
| Deepgram | No (batch) | ~$0.01 | 3 (pos/neg/neut) |
| AssemblyAI | No (batch) | ~$0.02 | 3 (pos/neg/neut) |
| AWS Nova Sonic | Yes | ~$0.01 | No structured output |
| OpenAI Realtime | Yes | Variable | No structured output |

**Hume is the premium option** — higher cost, but only choice for real-time structured emotion data.

---

## References

- [Hume Pricing Page](https://www.hume.ai/pricing)
- [Billing Documentation](https://dev.hume.ai/docs/resources/billing)
- [API Credits Application](https://www.hume.ai/api-application)
