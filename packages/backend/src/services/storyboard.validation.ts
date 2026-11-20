import type { StoryboardPlan, SceneInstruction, SceneChild, ComponentName } from '@edumotion/shared';
import { StoryboardValidationSchema, SceneValidationSchema } from '@edumotion/shared';
import { z } from 'zod';

/**
 * Validates storyboard quality and educational effectiveness
 * Checks for: visual relevance, scene structure, educational content
 */
export class StoryboardValidator {

  /**
   * Validate entire storyboard for quality
   */
  validate(storyboard: StoryboardPlan, script: string): z.infer<typeof StoryboardValidationSchema> {
    const sceneResults: z.infer<typeof SceneValidationSchema>[] = [];
    const overallIssues: string[] = [];
    const recommendations: string[] = [];
    let validScenes = 0;

    // Validate each scene
    for (const scene of storyboard.scenes) {
      const result = this.validateScene(scene, script);
      sceneResults.push(result);
      if (result.isValid) validScenes++;

      // Collect issues and recommendations
      overallIssues.push(...result.issues);
      recommendations.push(...result.warnings);
    }

    // Check for storyboard-level issues
    const storyboardIssues = this.validateStoryboardStructure(storyboard);
    overallIssues.push(...storyboardIssues);

    // Check for educational flow
    const flowIssues = this.validateEducationalFlow(storyboard, script);
    recommendations.push(...flowIssues);

    return StoryboardValidationSchema.parse({
      isValid: validScenes === storyboard.scenes.length && storyboardIssues.length === 0,
      totalScenes: storyboard.scenes.length,
      validScenes,
      sceneResults,
      overallIssues,
      recommendations,
    });
  }

  /**
   * Validate individual scene
   */
  private validateScene(scene: SceneInstruction, script: string): z.infer<typeof SceneValidationSchema> {
    const issues: string[] = [];
    const warnings: string[] = [];

    // Check for required components
    const hasBackground = scene.component === 'BackgroundScene' ||
      scene.children?.some(c => c.component === 'BackgroundScene');
    const hasVisual = this.hasEducationalVisual(scene);
    const hasText = this.hasTextComponent(scene);
    const hasSubtitle = this.hasSubtitleComponent(scene);

    // Validate scene structure
    if (!hasBackground) {
      issues.push('Scene missing BackgroundScene component');
    }

    if (!hasVisual) {
      issues.push('Scene missing educational visual component');
    }

    if (!hasText) {
      warnings.push('Scene should have AnimatedText for main concept');
    }

    if (!hasSubtitle) {
      warnings.push('Scene should have Subtitle component');
    }

    // Validate visual relevance
    let visualRelevance = 0;
    if (hasVisual) {
      visualRelevance = this.calculateVisualRelevance(scene, script);
      if (visualRelevance < 0.5) {
        issues.push(`Low visual relevance score: ${visualRelevance.toFixed(2)} - visuals may not match narration`);
      } else if (visualRelevance < 0.7) {
        warnings.push(`Visual relevance could be improved: ${visualRelevance.toFixed(2)}`);
      }
    }

    // Check scene duration
    const duration = scene.endFrame - scene.startFrame;
    if (duration < 30) {
      warnings.push(`Scene is very short (${duration} frames) - consider merging with adjacent scene`);
    } else if (duration > 300) {
      warnings.push(`Scene is very long (${duration} frames) - consider splitting`);
    }

    // Check for animation
    if (!this.hasAnimation(scene)) {
      warnings.push('Scene should have at least one animated element');
    }

    return SceneValidationSchema.parse({
      sceneId: scene.id,
      isValid: issues.length === 0,
      issues,
      warnings,
      hasVisual,
      hasText,
      hasSubtitle,
      visualRelevance: hasVisual ? visualRelevance : 0,
    });
  }

  /**
   * Check if scene has educational visual component
   */
  private hasEducationalVisual(scene: SceneInstruction): boolean {
    const visualComponents: ComponentName[] = [
      'EducationalObject', 'ObjectGroup', 'ConceptDiagram', 'MultiplicationTable',
      'ImageScene', 'Character', 'Teacher', 'SplitScreenComparison',
      'ProcessFlow', 'Timeline', 'HighlightedRegion', 'AnimatedDiagram',
      'NumberCounter', 'ObjectZoom', 'Callout'
    ];

    if (visualComponents.includes(scene.component)) {
      return true;
    }

    return scene.children?.some(child => visualComponents.includes(child.component)) ?? false;
  }

  /**
   * Check if scene has text component
   */
  private hasTextComponent(scene: SceneInstruction): boolean {
    return scene.children?.some(child => child.component === 'AnimatedText') ?? false;
  }

  /**
   * Check if scene has subtitle component
   */
  private hasSubtitleComponent(scene: SceneInstruction): boolean {
    return scene.children?.some(child => child.component === 'Subtitle') ?? false;
  }

  /**
   * Check if scene has animation
   */
  private hasAnimation(scene: SceneInstruction): boolean {
    // Check scene props for animation
    if (scene.props['animation']) return true;

    // Check children for animation
    return scene.children?.some(child =>
      child.props['animation'] ||
      child.props['startFrame'] !== undefined
    ) ?? false;
  }

  /**
   * Calculate visual relevance score (0-1)
   */
  private calculateVisualRelevance(scene: SceneInstruction, script: string): number {
    const visuals = this.getVisualComponents(scene);
    if (visuals.length === 0) return 0;

    const scriptLower = script.toLowerCase();
    let totalScore = 0;

    for (const visual of visuals) {
      const component = visual.component;
      const props = visual.props as Record<string, unknown>;

      // Check EducationalObject type
      if (component === 'EducationalObject') {
        const type = props['type'] as string | undefined;
        if (type) {
          const typeLower = type.toLowerCase();
          // Check if type appears in script
          if (scriptLower.includes(typeLower)) {
            totalScore += 0.8;
          } else {
            // Check for related concepts
            const related = this.getRelatedConcepts(typeLower);
            if (related.some(r => scriptLower.includes(r))) {
              totalScore += 0.6;
            } else {
              totalScore += 0.2; // Generic match
            }
          }
        }
      }

      // Check ImageScene
      if (component === 'ImageScene') {
        const src = props['src'] as string | undefined;
        if (src) {
          // Extract keywords from image path
          const keywords = this.extractKeywordsFromPath(src);
          const matches = keywords.filter(kw => scriptLower.includes(kw));
          totalScore += Math.min(0.8, matches.length * 0.2);
        }
      }

      // Check text components
      if (component === 'AnimatedText') {
        const text = props['text'] as string | undefined;
        if (text && scriptLower.includes(text.toLowerCase())) {
          totalScore += 0.5;
        }
      }

      // Check specialized components
      if (['SplitScreenComparison', 'ProcessFlow', 'Timeline'].includes(component)) {
        // These are highly relevant if script mentions comparison or process
        if (scriptLower.includes('compare') || scriptLower.includes('vs') ||
            scriptLower.includes('process') || scriptLower.includes('step')) {
          totalScore += 0.9;
        } else {
          totalScore += 0.4;
        }
      }
    }

    // Normalize by number of visuals
    return Math.min(1, totalScore / Math.max(1, visuals.length));
  }

  /**
   * Get visual components from scene
   */
  private getVisualComponents(scene: SceneInstruction): SceneChild[] {
    const visualComponents: ComponentName[] = [
      'EducationalObject', 'ObjectGroup', 'ConceptDiagram', 'MultiplicationTable',
      'ImageScene', 'Character', 'Teacher', 'AnimatedText', 'SplitScreenComparison',
      'ProcessFlow', 'Timeline', 'HighlightedRegion', 'AnimatedDiagram',
      'NumberCounter', 'ObjectZoom', 'Callout'
    ];

    const result: SceneChild[] = [];

    if (visualComponents.includes(scene.component)) {
      result.push({ component: scene.component, props: scene.props });
    }

    for (const child of scene.children ?? []) {
      if (visualComponents.includes(child.component)) {
        result.push(child);
      }
    }

    return result;
  }

  /**
   * Get related concepts for a given type
   */
  private getRelatedConcepts(type: string): string[] {
    const conceptMap: Record<string, string[]> = {
      'leaf': ['plant', 'photosynthesis', 'chlorophyll', 'tree', 'green'],
      'bone': ['skeleton', 'femur', 'skull', 'rib', 'human body'],
      'cell': ['biology', 'organism', 'microscope', 'dna', 'nucleus'],
      'atom': ['molecule', 'electron', 'proton', 'neutron', 'chemistry'],
      'computer': ['network', 'internet', 'server', 'technology', 'digital'],
      'brain': ['neuron', 'mind', 'thinking', 'nervous', 'synaptic'],
      'heart': ['circulation', 'blood', 'pump', 'cardiovascular', 'organ'],
      'water': ['liquid', 'ocean', 'river', 'rain', 'drink', 'H2O'],
      'sun': ['light', 'solar', 'energy', 'star', 'day'],
      'plant': ['leaf', 'photosynthesis', 'root', 'stem', 'flower'],
    };

    return conceptMap[type] || [];
  }

  /**
   * Extract keywords from image path
   */
  private extractKeywordsFromPath(path: string): string[] {
    const basename = path.split('/').pop() || path;
    const withoutExt = basename.replace(/\.[^.]+$/, '');

    // Split by common separators
    const parts = withoutExt.split(/[_-]/);

    return parts.filter(part =>
      part.length > 2 &&
      !['the', 'and', 'for', 'with', 'from', 'this', 'that'].includes(part.toLowerCase())
    );
  }

  /**
   * Validate storyboard structure
   */
  private validateStoryboardStructure(storyboard: StoryboardPlan): string[] {
    const issues: string[] = [];
    const scenes = storyboard.scenes;

    // Check frame continuity
    for (let i = 0; i < scenes.length - 1; i++) {
      const current = scenes[i];
      const next = scenes[i + 1];
      if (!current || !next) continue;
      if (current.endFrame !== next.startFrame) {
        issues.push(`Frame gap between scene ${current.id} (ends at ${current.endFrame}) and scene ${next.id} (starts at ${next.startFrame})`);
      }
    }

    // Check last scene
    const lastScene = scenes[scenes.length - 1];
    if (lastScene && lastScene.endFrame !== storyboard.totalFrames) {
      issues.push(`Last scene should end at totalFrames (${storyboard.totalFrames}), but ends at ${lastScene.endFrame}`);
    }

    // Check first scene
    const firstScene = scenes[0];
    if (firstScene && firstScene.startFrame !== 0) {
      issues.push(`First scene should start at frame 0, but starts at ${firstScene.startFrame}`);
    }

    // Check for end screen
    const hasEndScreen = scenes.some(scene =>
      scene.children?.some(c => c.component === 'EndScreen')
    );
    if (!hasEndScreen) {
      issues.push('Storyboard should end with an EndScreen component');
    }

    return issues;
  }

  /**
   * Validate educational flow
   */
  private validateEducationalFlow(storyboard: StoryboardPlan, script: string): string[] {
    const recommendations: string[] = [];
    const sentences = script.split('\n').filter(s => s.trim().length > 0);

    // Check scene count vs sentence count
    if (storyboard.scenes.length > sentences.length * 2) {
      recommendations.push(`Too many scenes (${storyboard.scenes.length}) for script length (${sentences.length} sentences) - consider combining scenes`);
    } else if (storyboard.scenes.length < Math.ceil(sentences.length / 2)) {
      recommendations.push(`Too few scenes (${storyboard.scenes.length}) for script length (${sentences.length} sentences) - consider splitting scenes`);
    }

    // Check for visual variety
    const visualTypes = new Set<string>();
    for (const scene of storyboard.scenes) {
      const visuals = this.getVisualComponents(scene);
      for (const visual of visuals) {
        visualTypes.add(visual.component);
      }
    }

    if (visualTypes.size < 3) {
      recommendations.push(`Low visual variety: only ${visualTypes.size} different visual component types used - consider using more diverse visuals`);
    }

    // Check for repeated visuals in consecutive scenes
    for (let i = 0; i < storyboard.scenes.length - 1; i++) {
      const currentScene = storyboard.scenes[i];
      const nextScene = storyboard.scenes[i + 1];
      if (!currentScene || !nextScene) continue;

      const currentVisuals = this.getVisualComponents(currentScene);
      const nextVisuals = this.getVisualComponents(nextScene);

      const repeated = currentVisuals.filter(cv =>
        nextVisuals.some(nv => nv.component === cv.component)
      );

      if (repeated.length > 1) {
        recommendations.push(`Scenes ${currentScene.id} and ${nextScene.id} use similar visuals - consider varying the composition`);
      }
    }

    return recommendations;
  }
}

export const storyboardValidator = new StoryboardValidator();
