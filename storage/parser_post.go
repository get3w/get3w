package storage

import (
	"strings"

	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/packages/liquid"
)

// ParsePost parse post
func (site *Site) ParsePost(template string, post *get3w.Post) (string, error) {
	if template == "" {
		template = post.Content
	}

	data := map[string]interface{}{
		"site": site.Current.AllParameters,
		"page": post.AllParameters,
	}

	var parsedContent string
	if strings.ToLower(site.Config.TemplateEngine) == TemplateEngineLiquid {
		parser := liquid.New(site.Path)
		content, err := parser.Parse(post.Content, data)
		if err != nil {
			return "", err
		}
		data["content"] = content
		parsedContent, err = parser.Parse(template, data)
		if err != nil {
			return "", err
		}
	} else {
		parsedContent = template
	}

	return parsedContent, nil
}
