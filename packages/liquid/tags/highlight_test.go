package tags

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestHighlightFactoryForNormalHighlight(t *testing.T) {
	parser := newParser(" %} hack {%endhighlight%}Z")
	tag, err := HighlightFactory(parser, nil)
	assert.Nil(t, err)
	assert.Equal(t, tag.Name(), "highlight")
	assert.Equal(t, parser.Current(), byte('Z'))
}

func TestHighlightFactoryForNestedHighlight(t *testing.T) {
	parser := newParser(" %} ha {%highlight%} {%if%} ck {%endhighlight%} {%  endhighlight  %}XZ ")
	tag, err := HighlightFactory(parser, nil)
	assert.Nil(t, err)
	assert.Equal(t, tag.Name(), "highlight")
	assert.Equal(t, parser.Current(), byte('X'))
}

func TestHighlightFactoryHandlesUnclosedHighlight(t *testing.T) {
	parser := newParser(" %} ouch ")
	tag, err := HighlightFactory(parser, nil)
	assert.Nil(t, err)
	assert.Equal(t, tag.Name(), "highlight")
	assert.Equal(t, parser.HasMore(), false)
}
