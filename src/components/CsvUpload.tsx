import { useState, useRef } from "react";
import { Upload, FileText, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "@/hooks/use-toast";
import { ProductData } from "@/pages/Index";

interface CsvUploadProps {
  onDataExtracted: (data: ProductData[]) => void;
  isProcessing: boolean;
  setIsProcessing: (processing: boolean) => void;
}

const CsvUpload = ({ onDataExtracted, isProcessing, setIsProcessing }: CsvUploadProps) => {
  const [dragActive, setDragActive] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast({
        title: "Invalid File Type",
        description: "Please upload a CSV file.",
        variant: "destructive",
      });
      return;
    }

    setFileName(file.name);
    setIsProcessing(true);

    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        throw new Error("CSV file must contain headers and at least one row of data.");
      }

      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      
      // Check for required columns - now looking for the correct column names
      const hasProductId = headers.includes('product_id');
      const hasProductTitle = headers.includes('product_title');
      const hasReviewText = headers.includes('review_text');
      
      if (!hasReviewText) {
        throw new Error("CSV must contain 'review_text' column.");
      }

      if (!hasProductId && !hasProductTitle) {
        throw new Error("CSV must contain either 'product_id' or 'product_title' column.");
      }

      console.log('CSV Headers detected:', headers);

      // Parse CSV data
      const reviews = lines.slice(1).map((line, index) => {
        // Handle CSV parsing with proper comma splitting (accounting for quoted values)
        const values = parseCSVLine(line);
        const row: any = {};
        headers.forEach((header, headerIndex) => {
          row[header] = values[headerIndex] || '';
        });
        console.log(`Row ${index + 1}:`, row);
        return row;
      });

      console.log('Total reviews parsed:', reviews.length);

      // Process with mock AI
      const processedData = await mockAIProcessing(reviews);
      onDataExtracted(processedData);

    } catch (error) {
      console.error('Error processing CSV:', error);
      toast({
        title: "Processing Error",
        description: error instanceof Error ? error.message : "Failed to process the CSV file.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Helper function to properly parse CSV lines with quoted values
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim().replace(/^"|"$/g, ''));
        current = '';
      } else {
        current += char;
      }
    }
    
    result.push(current.trim().replace(/^"|"$/g, ''));
    return result;
  };

  // Updated AI processing function to properly group by product
  const mockAIProcessing = async (reviews: any[]): Promise<ProductData[]> => {
    // Simulate API delay
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Group reviews by product - prioritize product_id, fallback to product_title
    const productGroups: { [key: string]: any[] } = {};
    
    reviews.forEach(review => {
      // Use product_id if available, otherwise use product_title
      const productKey = review.product_id || review.product_title || 'Unknown Product';
      const productName = review.product_title || review.product_id || 'Unknown Product';
      
      if (!productGroups[productKey]) {
        productGroups[productKey] = [];
      }
      productGroups[productKey].push({
        ...review,
        productName // Store the display name
      });
    });

    console.log('Product groups created:', Object.keys(productGroups));
    console.log('Number of unique products:', Object.keys(productGroups).length);

    // Process each product group
    const results: ProductData[] = Object.entries(productGroups).map(([productKey, productReviews]) => {
      const firstReview = productReviews[0];
      const productName = firstReview.productName || productKey;
      const category = firstReview.category || inferCategory(productName, productReviews);
      const features = extractFeatures(productReviews, category);
      
      console.log(`Processing product: ${productName} with ${productReviews.length} reviews`);

      return {
        productName,
        category,
        features,
        summary: {
          mostAppreciated: generateMostAppreciated(productReviews, category),
          leastAppreciated: generateLeastAppreciated(productReviews, category),
          overallSentiment: calculateOverallSentiment(productReviews)
        },
        reviewCount: productReviews.length
      };
    });

    console.log('Final results:', results);
    return results;
  };

  const calculateOverallSentiment = (reviews: any[]): 'positive' | 'neutral' | 'negative' => {
    if (reviews.length === 0) return 'neutral';
    
    // If sentiment column exists, use it
    const sentiments = reviews
      .map(r => r.sentiment?.toLowerCase())
      .filter(s => s && ['positive', 'negative', 'neutral'].includes(s));
    
    if (sentiments.length > 0) {
      const positiveCount = sentiments.filter(s => s === 'positive').length;
      const negativeCount = sentiments.filter(s => s === 'negative').length;
      
      if (positiveCount > negativeCount) return 'positive';
      if (negativeCount > positiveCount) return 'negative';
      return 'neutral';
    }
    
    // Fallback to rating if available
    const ratings = reviews
      .map(r => parseFloat(r.rating))
      .filter(r => !isNaN(r));
    
    if (ratings.length > 0) {
      const avgRating = ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
      if (avgRating >= 4) return 'positive';
      if (avgRating <= 2) return 'negative';
      return 'neutral';
    }
    
    return 'positive'; // Default fallback
  };

  const generateMostAppreciated = (reviews: any[], category: string): string[] => {
    // In a real implementation, this would analyze the review_text
    // For now, return category-appropriate positive aspects
    if (category.toLowerCase().includes('electronic') || category.toLowerCase().includes('phone') || category.toLowerCase().includes('laptop')) {
      return ['Excellent performance', 'Great build quality', 'Good value for money'];
    } else if (category.toLowerCase().includes('clothing') || category.toLowerCase().includes('fashion')) {
      return ['Comfortable fit', 'Quality material', 'Stylish design'];
    }
    return ['Great quality', 'Good value', 'Reliable product'];
  };

  const generateLeastAppreciated = (reviews: any[], category: string): string[] => {
    // In a real implementation, this would analyze the review_text for negative aspects
    if (category.toLowerCase().includes('electronic') || category.toLowerCase().includes('phone') || category.toLowerCase().includes('laptop')) {
      return ['Battery life could be better', 'Slow customer service', 'Limited warranty'];
    } else if (category.toLowerCase().includes('clothing') || category.toLowerCase().includes('fashion')) {
      return ['Sizing issues', 'Color fading', 'Shipping delays'];
    }
    return ['Higher price', 'Delivery time', 'Packaging could improve'];
  };

  const inferCategory = (productName: string, reviews: any[]): string => {
    const name = productName.toLowerCase();
    const reviewText = reviews.map(r => r.review_text || r.review || '').join(' ').toLowerCase();
    
    if (name.includes('phone') || name.includes('smartphone') || reviewText.includes('battery') || reviewText.includes('camera')) {
      return 'Electronics - Smartphone';
    } else if (name.includes('laptop') || name.includes('computer') || reviewText.includes('processor') || reviewText.includes('screen')) {
      return 'Electronics - Computer';
    } else if (name.includes('shirt') || name.includes('dress') || reviewText.includes('fabric') || reviewText.includes('fit')) {
      return 'Clothing';
    } else if (name.includes('chair') || name.includes('table') || reviewText.includes('wood') || reviewText.includes('assembly')) {
      return 'Furniture';
    }
    return 'General Product';
  };

  const extractFeatures = (reviews: any[], category: string) => {
    const features: any = {};
    
    if (category.includes('Electronics')) {
      features['Battery Life'] = { positive: ['Long lasting', 'All day usage'], negative: ['Drains quickly'], mentions: Math.floor(Math.random() * 10) + 5 };
      features['Display Quality'] = { positive: ['Sharp display', 'Vivid colors'], negative: ['Too bright'], mentions: Math.floor(Math.random() * 8) + 3 };
      features['Performance'] = { positive: ['Fast processing', 'Smooth operation'], negative: ['Occasional lag'], mentions: Math.floor(Math.random() * 12) + 7 };
    } else if (category.includes('Clothing')) {
      features['Material Quality'] = { positive: ['Soft fabric', 'Durable'], negative: ['Thin material'], mentions: Math.floor(Math.random() * 10) + 4 };
      features['Fit'] = { positive: ['Perfect fit', 'True to size'], negative: ['Too tight'], mentions: Math.floor(Math.random() * 15) + 8 };
      features['Comfort'] = { positive: ['Very comfortable', 'Breathable'], negative: ['Itchy'], mentions: Math.floor(Math.random() * 8) + 5 };
    } else {
      features['Build Quality'] = { positive: ['Well made', 'Sturdy'], negative: ['Flimsy'], mentions: Math.floor(Math.random() * 10) + 6 };
      features['Value'] = { positive: ['Great price', 'Worth it'], negative: ['Overpriced'], mentions: Math.floor(Math.random() * 12) + 4 };
    }
    
    return features;
  };

  return (
    <Card className="bg-white/10 backdrop-blur-md border-white/20 text-white">
      <CardContent className="p-8">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold mb-2">Upload Your CSV File</h2>
          <p className="text-purple-200">
            Upload a CSV file containing product reviews to extract meaningful features and insights.
          </p>
        </div>

        <div
          className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-all duration-300 ${
            dragActive 
              ? 'border-purple-400 bg-purple-400/10' 
              : 'border-white/30 hover:border-white/50'
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
            disabled={isProcessing}
          />

          {isProcessing ? (
            <div className="flex flex-col items-center space-y-4">
              <Loader2 className="w-12 h-12 text-purple-400 animate-spin" />
              <div>
                <p className="text-lg font-medium">Processing your data...</p>
                <p className="text-sm text-purple-200">This may take a few moments</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center space-y-4">
              <Upload className="w-12 h-12 text-purple-400" />
              <div>
                <p className="text-lg font-medium">
                  {fileName ? `Selected: ${fileName}` : 'Drop your CSV file here'}
                </p>
                <p className="text-sm text-purple-200">
                  or click to browse files
                </p>
              </div>
              <Button
                variant="secondary"
                className="bg-purple-600 hover:bg-purple-700 text-white border-none"
                onClick={() => fileInputRef.current?.click()}
              >
                <FileText className="w-4 h-4 mr-2" />
                Choose File
              </Button>
            </div>
          )}
        </div>

        <Alert className="mt-6 bg-blue-500/10 border-blue-400/30 text-blue-100">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>CSV Format:</strong> Your file should contain columns for 'product_id' or 'product_title', 
            'review_text', and optionally 'category', 'rating', and 'sentiment'. Each row represents one review.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
};

export default CsvUpload;
