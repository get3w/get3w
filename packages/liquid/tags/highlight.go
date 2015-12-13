package tags

import (
	"io"

	"github.com/get3w/get3w/packages/liquid/core"
)

var highlight = new(Highlight)
var endHighlight = &End{"highlight"}

// Special handling to just quickly skip over it all
func HighlightFactory(p *core.Parser, config *core.Configuration) (core.Tag, error) {
	openTags := 1
	for {
		_, markupType := p.ToMarkup(false)
		if markupType == core.TagMarkup {
			p.ForwardBy(2) // skip {%
			if name := p.ReadName(); name == "highlight" {
				openTags++
			} else if name == "endhighlight" {
				openTags--
				if openTags == 0 {
					p.SkipPastTag()
					break
				}
			}
		} else if markupType == core.OutputMarkup {

			p.SkipPastTag()
		} else {
			break
		}
	}
	return highlight, nil
}

func EndHighlightFactory(p *core.Parser, config *core.Configuration) (core.Tag, error) {
	return endHighlight, nil
}

// Highlight tag is a special tag in that, while it looks like a container tag,
// we treat it as an end tag and just move the parser all the way past the
// end tag. A
type Highlight struct {
}

func (c *Highlight) AddCode(code core.Code) {
	panic("AddCode should not have been called on a highlight")
}

func (c *Highlight) AddSibling(tag core.Tag) error {
	panic("AddSibling should not have been called on a highlight")
}

func (c *Highlight) Execute(writer io.Writer, data map[string]interface{}) core.ExecuteState {
	panic("Render should not have been called on a highlight")
}

func (c *Highlight) Name() string {
	return "highlight"
}

func (c *Highlight) Type() core.TagType {
	return core.NoopTag
}
