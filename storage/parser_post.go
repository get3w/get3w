package storage

import (
	"strings"

	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/engines/liquid"
)

// ParsePost parse post
func (parser *Parser) ParsePost(template string, post *get3w.Post) (string, error) {
	if template == "" {
		template = post.Content
	}

	parser.Current.AllParameters["related_posts"] = getRelatedPosts(parser.Current.Posts, post)

	data := map[string]interface{}{
		"site": parser.Current.AllParameters,
		"page": post.AllParameters,
	}

	var parsedContent string
	if strings.ToLower(parser.Config.TemplateEngine) == TemplateEngineLiquid {
		parser := liquid.New(parser.Path)
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
