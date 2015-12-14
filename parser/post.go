package parser

import (
	"strings"

	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/packages/liquid"
)

// ParsePost parse post
func ParsePost(rootPath, template string, config *get3w.Config, post *get3w.Post) (string, error) {
	if template == "" {
		template = post.Content
	}

	data := map[string]interface{}{
		"site": config.All,
		"page": post.All,
	}

	var parsedContent string
	if strings.ToLower(config.TemplateEngine) == TemplateEngineLiquid {
		parser := liquid.New(rootPath)
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
