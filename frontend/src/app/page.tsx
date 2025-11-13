"use client"

import { useEffect, useMemo, useState } from "react"
import { getUserId } from "@/lib/user"
import { BACKEND_URL } from "@/lib/config"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"

interface ImageWorkflowResult {
  success: boolean
  imageUrl: string
  metadata: {
    model: {
      id: string
      name: string
      fullName: string
      capabilities: {
        supportsSingleReference: boolean
        supportsMultipleReferences: boolean
        supportsImageToImage: boolean
      }
    }
    prompt: string
    negativePrompt: string | null
    referenceImages: string[]
    aspectRatio: string
    style: string
    size?: string
    dimensions?: {
      width: number
      height: number
    }
  }
  reasoning: string
  workflow: {
    toolCalls: Array<{
      tool: string
      success: boolean
    }>
  }
}

export default function ImageWorkflowPage() {
  const [userId] = useState(() => getUserId())
  const { toast } = useToast()

  const [prompt, setPrompt] = useState("")
  const [referenceImages, setReferenceImages] = useState("")
  const [preferredModelId, setPreferredModelId] = useState("")
  const [generated, setGenerated] = useState<ImageWorkflowResult | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [agentAvailable, setAgentAvailable] = useState<boolean | null>(null)

  useEffect(() => {
    let ignore = false

    ;(async () => {
      try {
        const response = await fetch(`${BACKEND_URL}/api/agent/status`)
        const data = await response.json()
        if (!ignore) {
          setAgentAvailable(Boolean(data.orchestratorAvailable))
          if (!data.orchestratorAvailable) {
            toast({
              title: "Agent unavailable",
              description: "Gemini agent is offline. Configure GEMINI_API_KEY on the backend.",
              variant: "destructive",
            })
          }
        }
      } catch (error) {
        console.error("Failed to check agent status", error)
        if (!ignore) {
          setAgentAvailable(false)
          toast({
            title: "Connection failed",
            description: error instanceof Error ? error.message : "Unable to connect to agent server.",
            variant: "destructive",
          })
        }
      }
    })()

    return () => {
      ignore = true
    }
  }, [toast])

  const isReady = useMemo(() => agentAvailable !== false, [agentAvailable])

  const handleGenerate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!prompt.trim()) {
      toast({
        title: "Prompt required",
        description: "Enter a prompt to describe what you want to create.",
        variant: "destructive",
      })
      return
    }

    setIsGenerating(true)
    setGenerated(null)
    setErrorMessage(null)

    try {
      // Parse reference images (comma or newline separated URLs)
      const refImages = referenceImages
        .split(/[\n,]+/)
        .map(url => url.trim())
        .filter(url => url.length > 0)

      const response = await fetch(`${BACKEND_URL}/api/agent/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          prompt: prompt.trim(),
          referenceImages: refImages.length > 0 ? refImages : undefined,
          preferredModelId: preferredModelId.trim() || undefined,
        }),
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Image generation failed")
      }

      setGenerated(data as ImageWorkflowResult)
      toast({
        title: "Image ready",
        description: "Your image has been generated successfully.",
      })
    } catch (error) {
      console.error("Image generation failed:", error)
      const message = error instanceof Error ? error.message : "Image generation failed"
      setErrorMessage(message)
      toast({
        title: "Generation failed",
        description: message,
        variant: "destructive",
      })
    } finally {
      setIsGenerating(false)
    }
  }

  const resetForm = () => {
    setPrompt("")
    setReferenceImages("")
    setPreferredModelId("")
    setGenerated(null)
    setErrorMessage(null)
  }

  const handleTweak = () => {
    if (!generated) return

    // Use the refined prompt as the base
    setPrompt(generated.metadata.prompt)
    
    // Add the generated image as a reference
    const currentRefs = generated.metadata.referenceImages.join("\n")
    const newRef = generated.imageUrl
    setReferenceImages(currentRefs ? `${currentRefs}\n${newRef}` : newRef)
    
    // Keep the same model preference
    setPreferredModelId(generated.metadata.model.id)
    
    // Scroll to top to show the form
    window.scrollTo({ top: 0, behavior: "smooth" })
    
    toast({
      title: "Ready to tweak",
      description: "The form has been filled with your previous result. Modify the prompt and generate again.",
    })
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-8 px-6 py-12">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">LANA | Image Agent</h1>
        <p className="text-muted-foreground">
          Describe what you want to create, optionally add reference images, and let the AI agent intelligently select the best model and generate your image.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Describe Your Vision</CardTitle>
          <CardDescription>
            The AI agent will intelligently select the best model, refine your prompt, and generate your image with full transparency.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleGenerate} className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="prompt">Prompt *</Label>
              <Textarea
                id="prompt"
                placeholder="A majestic animal in the middle of a stunning mountain landscape..."
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                disabled={!isReady || isGenerating}
                className="min-h-[140px] resize-none"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reference">
                Reference Images <span className="text-muted-foreground text-xs">(optional, comma or newline separated URLs)</span>
              </Label>
              <Textarea
                id="reference"
                placeholder="https://example.com/image1.jpg, https://example.com/image2.jpg"
                value={referenceImages}
                onChange={(event) => setReferenceImages(event.target.value)}
                disabled={!isReady || isGenerating}
                className="min-h-[100px] resize-none"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="model">
                Preferred Model <span className="text-muted-foreground text-xs">(optional, AI will choose if not specified)</span>
              </Label>
              <Input
                id="model"
                placeholder="e.g. flux-dev, flux-schnell, flux-1.1-pro-ultra"
                value={preferredModelId}
                onChange={(event) => setPreferredModelId(event.target.value)}
                disabled={!isReady || isGenerating}
              />
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-sm text-muted-foreground">
                {isReady ? `Connected | User: ${userId.substring(0, 8)}...` : "Connecting to agent..."}
              </div>
              <div className="flex gap-3">
                <Button type="button" variant="outline" onClick={resetForm} disabled={isGenerating}>
                  Reset
                </Button>
                <Button type="submit" disabled={!isReady || isGenerating}>
                  {isGenerating ? "Generating..." : "Generate"}
                </Button>
              </div>
            </div>

            {errorMessage && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {errorMessage}
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {generated && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Generated Image</CardTitle>
              <CardDescription>Here's your AI-generated image with full transparency.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="overflow-hidden rounded-xl border bg-muted">
                <img
                  src={generated.imageUrl}
                  alt="Generated artwork"
                  className="h-full w-full object-cover"
                />
              </div>

              <div className="space-y-4">
                {/* AI Reasoning */}
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    AI Reasoning
                  </h3>
                  <p className="mt-2 rounded-lg border bg-card px-3 py-2 text-sm leading-relaxed whitespace-pre-line">
                    {generated.reasoning}
                  </p>
                </div>

                <Separator />

                {/* Refined Prompt */}
                <div>
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    Refined Prompt
                  </h3>
                  <p className="mt-2 rounded-lg border bg-card px-3 py-2 text-sm leading-relaxed">
                    {generated.metadata.prompt}
                  </p>
                </div>

                {/* Negative Prompt */}
                {generated.metadata.negativePrompt && (
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      Negative Prompt
                    </h3>
                    <p className="mt-2 rounded-lg border bg-card px-3 py-2 text-sm leading-relaxed text-muted-foreground">
                      {generated.metadata.negativePrompt}
                    </p>
                  </div>
                )}

                {/* Model & Settings */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Model</Label>
                    <div className="rounded-md border bg-card px-3 py-2 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{generated.metadata.model.name}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{generated.metadata.model.fullName}</p>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Aspect Ratio</Label>
                    <div className="rounded-md border bg-card px-3 py-2 text-sm">
                      {generated.metadata.aspectRatio}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Style</Label>
                    <div className="rounded-md border bg-card px-3 py-2 text-sm">
                      {generated.metadata.style}
                    </div>
                  </div>
                  {generated.metadata.size && (
                    <div className="space-y-1.5">
                      <Label className="text-xs text-muted-foreground">Size</Label>
                      <div className="rounded-md border bg-card px-3 py-2 text-sm">
                        {generated.metadata.size}
                      </div>
                    </div>
                  )}
                </div>

                {/* Reference Images */}
                {generated.metadata.referenceImages.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      Reference Images Used
                    </h3>
                    <div className="mt-2 space-y-1">
                      {generated.metadata.referenceImages.map((url, index) => (
                        <div key={index} className="rounded-md border bg-card px-3 py-2 text-xs text-muted-foreground break-all">
                          {index + 1}. {url}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <Separator />

                {/* Action Buttons */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Actions</Label>
                  <div className="flex gap-2">
                    <Button
                      variant="default"
                      onClick={handleTweak}
                      className="flex-1"
                    >
                      ✨ Tweak This
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        const link = document.createElement("a")
                        link.href = generated.imageUrl
                        link.download = `lana-image-${Date.now()}.png`
                        document.body.appendChild(link)
                        link.click()
                        document.body.removeChild(link)
                        toast({
                          title: "Downloading image",
                          description: "Your image will be saved locally.",
                        })
                      }}
                    >
                      💾 Save
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Workflow Trace */}
          <Card>
            <CardHeader>
              <CardTitle>Workflow Trace</CardTitle>
              <CardDescription>Tools executed by the AI agent to generate your image.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {generated.workflow.toolCalls.map((call, index) => (
                  <div key={index} className="flex items-center gap-3 rounded-lg border bg-card px-4 py-3">
                    <Badge variant={call.success ? "default" : "destructive"}>
                      {index + 1}
                    </Badge>
                    <div className="flex-1">
                      <p className="text-sm font-medium">{call.tool}</p>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {call.success ? "✓ Success" : "✗ Failed"}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
