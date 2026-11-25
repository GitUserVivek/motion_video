import { describe, expect, it } from 'vitest';
import {
  fixMarathiWording,
  hasDevanagari,
  mappedTokens,
  marathiObjectType,
  normalizeForComparison,
  unicodeTokens,
} from '../services/text.language.js';

describe('text.language', () => {
  it('normalises Marathi text instead of erasing it', () => {
    expect(normalizeForComparison('काय आहे, तुम्ही?')).toBe('काय आहे तुम्ही');
    expect(unicodeTokens('प्रकाशसंश्लेषण हे पाणी')).toEqual(['प्रकाशसंश्लेषण', 'हे', 'पाणी']);
    expect(hasDevanagari('photosynthesis प्रकाशसंश्लेषण')).toBe(true);
    expect(hasDevanagari('photosynthesis')).toBe(false);
  });

  it('maps Marathi object words to the artwork vocabulary', () => {
    expect(marathiObjectType('पान')).toBe('leaf');
    expect(marathiObjectType('सूर्याचे प्रकाश')).toBe('sun');
    expect(marathiObjectType('पाणी')).toBe('water');
    expect(mappedTokens('सूर्याचे प्रकाश')).toEqual(
      expect.arrayContaining(['sun', 'sunlight', 'light']),
    );
    expect(mappedTokens('कार्बन डाइऑक्साइड')).toEqual(
      expect.arrayContaining(['carbon', 'dioxide']),
    );
  });

  it('maps Marathi geometry labels so English-named diagrams can match them', () => {
    expect(mappedTokens('त्रिकोण')).toEqual(expect.arrayContaining(['triangle']));
    expect(mappedTokens('कोन')).toEqual(expect.arrayContaining(['angle']));
    expect(mappedTokens('कर्ण')).toEqual(expect.arrayContaining(['hypotenuse']));
    expect(mappedTokens('पिथागोरस थेअरम')).toEqual(
      expect.arrayContaining(['pythagorean', 'theorem']),
    );
  });

  it('repairs the label-level Marathi wording mistakes from the review', () => {
    expect(fixMarathiWording('सूर्याचे प्रकाश शोषण')).toBe('सूर्यप्रकाशाचे शोषण');
    expect(fixMarathiWording('पाणी वाहतुकी')).toBe('पाण्याची वाहतूक');
    expect(fixMarathiWording('कार्बन डाइऑक्साइड')).toBe('कार्बन डायऑक्साइड');
    expect(fixMarathiWording('ग्लुकोज')).toBe('ग्लूकोज');
  });
});
