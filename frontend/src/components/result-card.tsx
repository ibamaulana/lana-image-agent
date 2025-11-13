"use client"

import { useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Download, Upload, Eye, RefreshCw } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import Image from "next/image"
import { PublishCollectionPopup } from "./publish-collection-popup"
import { useRouter } from "next/navigation"

interface ResultCardProps {
  imageUrl: string
  prompt?: string
  imageId?: string
  collectionId?: string
  onTweak?: () => void
}

export function ResultCard({ imageUrl, prompt, imageId, collectionId, onTweak }: ResultCardProps) {
  const { toast } = useToast()
  const [showPublishDialog, setShowPublishDialog] = useState(false)
  const router = useRouter()

  const handlePublishImage = () => {
    if (!imageId) {
      toast({
        title: "Error",
        description: "Image ID is missing. Cannot publish image.",
        variant: "destructive",
      })
      return
    }
    setShowPublishDialog(true)
  }

  const handleDownloadImage = async () => {
    try {
      const response = await fetch(imageUrl)
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `generated-image-${Date.now()}.jpg`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      
      toast({
        title: "Downloaded",
        description: "Image downloaded successfully",
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to download image",
        variant: "destructive",
      })
    }
  }

  const handleViewCollection = () => {
    if (collectionId || imageId) {
      router.push(`/collection/${collectionId || imageId}`)
    } else {
      toast({
        title: "Error",
        description: "Collection URL not available",
        variant: "destructive",
      })
    }
  }

  const handleTweak = () => {
    if (onTweak) {
      onTweak()
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Generated Image</CardTitle>
          <CardDescription>Your AI-generated image is ready</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-lg overflow-hidden bg-muted h-auto min-h-[400px] flex items-center justify-center relative">
            {imageUrl ? (
              <Image
                src={imageUrl}
                alt="Generated image"
                width={800}
                height={800}
                className="w-full h-auto object-contain"
                unoptimized
              />
            ) : (
              <div className="text-center text-muted-foreground">
                <p>No image available</p>
              </div>
            )}
          </div>

          {/* Prompt if available */}
          {prompt && (
            <div>
              <p className="text-sm font-medium mb-1">Prompt</p>
              <p className="text-sm text-muted-foreground">{prompt}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="grid grid-cols-3 gap-2 pt-4">
            <Button variant="outline" size="sm" onClick={handlePublishImage}>
              <Upload className="mr-2 h-4 w-4" />
              Publish Image
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownloadImage}>
              <Download className="mr-2 h-4 w-4" />
              Download Image
            </Button>
            <Button variant="outline" size="sm" onClick={handleTweak}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Tweak
            </Button>
          </div>
          <div className="pt-2">
            <Button variant="default" size="sm" className="w-full" onClick={handleViewCollection}>
              <Eye className="mr-2 h-4 w-4" />
              View Collection
            </Button>
          </div>
        </CardContent>
      </Card>

      <PublishCollectionPopup
        open={showPublishDialog}
        onOpenChange={setShowPublishDialog}
        imageId={imageId}
        imageUrl={imageUrl}
        currentTitle={prompt?.substring(0, 100) || ""}
        currentDescription={prompt || ""}
      />
    </>
  )
}
