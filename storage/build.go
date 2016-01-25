package storage

import (
	"github.com/get3w/get3w"
	"github.com/get3w/get3w/pkg/stringutils"
)

// Build all pages in the app.
func (parser *Parser) Build(copy bool) error {
	parser.LoadSitesResources()

	destinationPrefix := parser.Storage.GetDestinationPrefix("")
	err := parser.Storage.NewFolder(destinationPrefix)
	if err != nil {
		return err
	}

	if copy {
		excludeKeys := []string{}
		for _, excludeKey := range parser.Config.Exclude {
			excludeKeys = append(excludeKeys, parser.Storage.GetSourceKey(excludeKey))
		}

		includeKeys := []string{}
		for _, includeKey := range parser.Config.Include {
			includeKeys = append(includeKeys, parser.Storage.GetSourceKey(includeKey))
		}

		for _, site := range parser.Sites {
			parser.Current = site
			for _, excludeKey := range parser.getExcludeKeys(parser.Current.Pages) {
				excludeKeys = append(excludeKeys, excludeKey)
			}
		}
		err := parser.buildCopy(excludeKeys, includeKeys)
		if err != nil {
			return err
		}
	}

	for _, site := range parser.Sites {
		parser.Current = site

		err := parser.buildPages(site.Pages)
		if err != nil {
			return err
		}

		err = parser.buildPosts()
		if err != nil {
			return err
		}
	}

	parser.Current = parser.Default

	return nil
}

func (parser *Parser) getExcludeKeys(pages []*get3w.Page) []string {
	excludeKeys := []string{}
	for _, page := range pages {
		if page.Path != "" {
			excludeKeys = append(excludeKeys, parser.key(page.Path))
		}
		if len(page.Children) > 0 {
			childKeys := parser.getExcludeKeys(page.Children)
			for _, childKey := range childKeys {
				excludeKeys = append(excludeKeys, childKey)
			}
		}
	}
	return excludeKeys
}

func (parser *Parser) buildCopy(excludeKeys, includeKeys []string) error {
	files, err := parser.Storage.GetAllFiles(parser.Storage.GetSourcePrefix(""))
	if err != nil {
		return err
	}

	for _, file := range files {
		if file.IsDir || isUnderscoreOrDotPrefix(file.Path) {
			continue
		}
		sourceKey := parser.Storage.GetSourceKey(file.Path)
		destinationKey := parser.Storage.GetDestinationKey(file.Path)

		if stringutils.HasPrefixIgnoreCase(excludeKeys, sourceKey) {
			if !stringutils.HasPrefixIgnoreCase(includeKeys, sourceKey) {
				continue
			}
		}

		err := parser.Storage.CopyToDestination(sourceKey, destinationKey)
		if err != nil {
			return err
		}
	}

	return nil
}

func (parser *Parser) buildPages(pages []*get3w.Page) error {
	for _, page := range pages {
		template, layout := parser.getTemplate(page.Layout, parser.Config.LayoutPage)
		paginators := parser.getPagePaginators(page)
		for _, paginator := range paginators {
			parsedContent, err := parser.parsePage(template, page, paginator)
			if err != nil {
				parser.LogError(layout, paginator.Path, err)
			}

			err = parser.Storage.WriteDestination(parser.destinationKey(paginator.Path), []byte(parsedContent))
			if err != nil {
				parser.LogError(layout, paginator.Path, err)
			}
		}

		if len(page.Children) > 0 {
			parser.buildPages(page.Children)
		}
	}
	return nil
}

func (parser *Parser) buildPosts() error {
	posts := parser.Current.Posts
	for _, post := range posts {
		template, layout := parser.getTemplate(post.Layout, parser.Config.LayoutPost)
		parsedContent, err := parser.parsePost(template, post)
		if err != nil {
			parser.LogError(layout, post.URL, err)
		}

		err = parser.Storage.WriteDestination(parser.destinationKey(post.URL), []byte(parsedContent))
		if err != nil {
			parser.LogError(layout, post.URL, err)
		}
	}
	return nil
}
