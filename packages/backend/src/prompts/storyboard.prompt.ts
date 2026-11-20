import type { VideoConfig } from '@edumotion/shared';

/**
 * Enhanced storyboard prompt with visual planning and educational scene structure
 */
export function buildStoryboardPrompt(
  script: string,
  config: VideoConfig,
  audioDurationMs: number,
): string {
  const totalFrames = Math.ceil((audioDurationMs / 1000) * config.fps);
  const sceneCount = Math.min(8, Math.max(4, Math.ceil(audioDurationMs / 10000)));

  const availableComponents = [
    'AnimatedText', 'AnimatedNumber', 'Character', 'Teacher',
    'EducationalObject', 'ObjectGroup', 'ConceptDiagram',
    'MultiplicationTable', 'ImageScene', 'BackgroundScene',
    'Subtitle', 'QuestionCard', 'Confetti', 'EndScreen', 'ProgressBar',
    'SplitScreenComparison', 'ProcessFlow', 'Timeline', 'HighlightedRegion',
    'AnimatedDiagram', 'NumberCounter', 'KineticTypography'
  ];

  // Extract key concepts from script for better visual planning
  const concepts = extractKeyConcepts(script);
  const topic = inferTopicFromScript(script);

  return `You are a professional educational video storyboard planner. Create a detailed JSON storyboard for the following script. Every visual must REINFORCE the narration.

SCRIPT:
${script}

VIDEO SPECS:
- Total frames: ${totalFrames}
- FPS: ${config.fps}
- Duration: ${Math.round(audioDurationMs / 1000)}s
- Aspect ratio: ${config.aspectRatio}
- Animation theme: ${config.animationTheme}
- Estimated scenes: ${sceneCount}

INFERRED TOPIC: ${topic}
KEY CONCEPTS: ${concepts.join(', ')}

VISUAL STORYTELLING RULES (MANDATORY):

1. SCENE STRUCTURE:
   - Create ${sceneCount} scenes that tell a visual story
   - Each scene must teach ONE specific concept from the narration
   - Scene order must match the script flow
   - Each scene must have a clear visual focus

2. VISUAL SELECTION:
   - Every visual element MUST directly illustrate what's being said
   - NO generic icons when a specific illustration is needed
   - NO decorative elements that don't explain the concept
   - NO repeating the same visual in consecutive scenes
   - Use EducationalObject types that MATCH the narration: ${concepts.map(c => `"${c}"`).join(', ')}

3. ASSET MATCHING (CRITICAL):
   For topic "${topic}", use these specific visual types:
   ${getTopicSpecificVisuals(topic)}

   If the narration mentions specific things, SHOW THOSE THINGS:
   - "skeleton" → show bones, skeleton
   - "photosynthesis" → show leaf, sun, plant
   - "computer network" → show servers, routers, connections
   - "human body" → show organs, systems
   - "mathematics" → show equations, diagrams, calculations

4. LAYOUT & COMPOSITION:
   - Main visual should occupy 60-80% of screen space
   - Text should be LARGE and READABLE (fontSize: 50-90 for titles, 30-40 for body)
   - Place text in top 25% or bottom 25% of screen
   - Center important visuals at 50%/50%
   - Use "left" and "right" positioning to create visual variety
   - Alternate: left-aligned, center, right-aligned across scenes

5. ANIMATION & MOVEMENT:
   - EVERY scene must have at least one animation
   - Use "animation": "fadeIn", "slideIn", "bounce", "zoom", "pop"
   - Stagger animations: startFrame should be 5-15 frames apart
   - Animate the most important element first
   - Camera should move slightly in every scene (zoomIn, zoomOut, panLeft, panRight)

6. EDUCATIONAL ENHANCEMENTS:
   - If narration mentions a number with units (30%, 5km, 2 million), add AnimatedNumber
   - If narration compares things, use SplitScreenComparison
   - If narration explains a process, use ProcessFlow or Timeline
   - If narration lists items, use ConceptDiagram
   - If narration asks a question, use QuestionCard
   - Final scene MUST have EndScreen with summary

7. SCENE CONTENT REQUIREMENTS:
   - Scene 1: Hook visual + title (grab attention)
   - Middle scenes: Progressive explanation with changing visuals
   - Final scene: Summary/EndScreen with key takeaway
   - EVERY scene must have: BackgroundScene + at least 1 visual + AnimatedText + Subtitle

8. TECHNICAL REQUIREMENTS:
   - First scene: startFrame = 0
   - Last scene: endFrame = ${totalFrames}
   - Scene frames must be contiguous (no gaps, no overlaps)
   - Distribute frames evenly: ~${Math.round(totalFrames / sceneCount)} per scene
   - All frame values must be integers

AVAILABLE COMPONENTS: ${availableComponents.join(', ')}

EducationalObject types available:
book, apple, globe, atom, lightbulb, calculator, pencil, star, leaf, plant, sun, water, cloud, rocket, heart, cell, microscope, brain, bone, skeleton, dna, neuron, circuit, server, network, equation, chart, timeline

RETURN ONLY valid JSON with this exact structure:
{
  "scenes": [
    {
      "id": "scene-1",
      "startFrame": 0,
      "endFrame": 120,
      "component": "BackgroundScene",
      "props": {"theme": "educational"},
      "children": [
        {"component": "EducationalObject", "props": {"type": "leaf", "size": 200, "top": "50%", "left": "50%", "startFrame": 10, "animation": "fadeIn"}},
        {"component": "AnimatedText", "props": {"text": "How do plants feed themselves?", "animation": "words", "fontSize": 60, "top": "20%", "startFrame": 15}},
        {"component": "Subtitle", "props": {"entries": []}}
      ]
    }
  ]
}

Remember: Every visual MUST help explain the narration. If you can't find a relevant visual, DON'T include one — an empty space is better than a wrong visual.`;
}

/**
 * Extract key concepts from script for better visual matching
 */
function extractKeyConcepts(script: string): string[] {
  const sentences = script.split('\n').filter(s => s.trim().length > 0);
  const concepts: Set<string> = new Set();

  const educationalTopics = [
    // Science
    'photosynthesis', 'chlorophyll', 'plant', 'leaf', 'sunlight', 'oxygen', 'carbon dioxide',
    'bone', 'skeleton', 'femur', 'rib cage', 'skull', 'organ', 'heart', 'lung', 'brain',
    'cell', 'dna', 'gene', 'protein', 'neuron', 'synaptic', 'bacteria', 'virus',
    'atom', 'molecule', 'electron', 'proton', 'neutron', 'chemical', 'reaction',
    'gravity', 'force', 'motion', 'energy', 'light', 'sound', 'wave',
    // Technology
    'computer', 'network', 'internet', 'router', 'server', 'database', 'algorithm',
    'artificial intelligence', 'machine learning', 'neural network', 'ai', 'robot',
    'circuit', 'processor', 'memory', 'storage', 'cloud', 'data', 'binary',
    'programming', 'code', 'software', 'hardware', 'application',
    // Mathematics
    'mathematics', 'math', 'equation', 'algebra', 'geometry', 'calculus', 'statistics',
    'number', 'addition', 'subtraction', 'multiplication', 'division',
    'fraction', 'percentage', 'decimal', 'graph', 'chart', 'diagram',
    // History/Geography
    'history', 'war', 'revolution', 'discovery', 'exploration', 'civilization',
    'map', 'country', 'continent', 'ocean', 'mountain', 'river', 'city',
    // Everyday
    'food', 'nutrition', 'cooking', 'recipe', 'ingredient',
    'transportation', 'car', 'train', 'airplane', 'bicycle',
    'communication', 'language', 'speech', 'writing', 'reading'
  ];

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    for (const topic of educationalTopics) {
      if (lower.includes(topic)) {
        concepts.add(topic);
      }
    }
  }

  // If no concepts found, try to extract nouns
  if (concepts.size === 0) {
    const words = script.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (word.length > 4 && !['the', 'and', 'for', 'with', 'this', 'that', 'from', 'have', 'been', 'were', 'will'].includes(word)) {
        concepts.add(word);
        if (concepts.size >= 5) break;
      }
    }
  }

  return Array.from(concepts).slice(0, 8);
}

/**
 * Infer the main topic from script
 */
function inferTopicFromScript(script: string): string {
  const sentences = script.split('\n').filter(s => s.trim().length > 0);
  if (sentences.length === 0) return 'general';

  const firstSentence = (sentences[0] ?? '').toLowerCase();

  // Check for common topic patterns
  const topicPatterns = [
    { pattern: /photo\w*|chlorophyll|leaf.*sun|plant.*food|sunlight.*energy/, topic: 'photosynthesis' },
    { pattern: /bone|skeleton|femur|rib.*cage|skull|206/, topic: 'human skeleton' },
    { pattern: /computer|network|internet|router|server|ai|artificial/, topic: 'technology' },
    { pattern: /cell|dna|gene|organ|heart|lung|brain/, topic: 'biology' },
    { pattern: /atom|molecule|electron|proton|chemical|physics/, topic: 'chemistry' },
    { pattern: /math|mathematics|equation|algebra|geometry|calculus/, topic: 'mathematics' },
    { pattern: /history|war|discovery|exploration|civilization/, topic: 'history' },
    { pattern: /map|country|continent|ocean|mountain|geography/, topic: 'geography' },
    { pattern: /food|nutrition|cooking|recipe/, topic: 'nutrition' },
    { pattern: /space|planet|moon|mars|rocket|astronaut|galaxy/, topic: 'space' },
  ];

  for (const { pattern, topic } of topicPatterns) {
    if (pattern.test(firstSentence) || pattern.test(script.toLowerCase())) {
      return topic;
    }
  }

  // Return first few words as topic
  return firstSentence.split(' ').slice(0, 3).join(' ');
}

/**
 * Get topic-specific visual recommendations
 */
function getTopicSpecificVisuals(topic: string): string {
  const visuals: Record<string, string> = {
    'photosynthesis': 'Use: leaf, plant, sun, water, cloud, atom (for CO2). Show process flow: sun → leaf → plant → oxygen',
    'human skeleton': 'Use: bone, skeleton, skull, femur. Show: full skeleton, bone structure, rib cage protecting organs',
    'biology': 'Use: cell, dna, heart, lung, brain, neuron. Show: cellular structures, organ systems, biological processes',
    'chemistry': 'Use: atom, molecule, beaker, test tube. Show: atomic structure, chemical reactions, periodic table',
    'technology': 'Use: computer, circuit, server, network. Show: hardware, software, data flow, connections',
    'space': 'Use: rocket, globe, star, planet. Show: solar system, galaxy, space exploration',
    'mathematics': 'Use: calculator, chart, graph, equation. Show: calculations, geometric shapes, data visualization',
    'history': 'Use: book, globe, timeline. Show: historical events, maps, artifacts',
    'geography': 'Use: globe, map, mountain, river. Show: world map, landmarks, geographical features',
    'nutrition': 'Use: apple, leaf, water. Show: healthy foods, nutritional information, food groups',
    'general': 'Use: lightbulb (idea), book (knowledge), globe (world). Show: relevant concepts from narration'
  };

  return visuals[topic] ?? visuals['general'] ?? 'Use: lightbulb (idea), book (knowledge), globe (world)';
}
