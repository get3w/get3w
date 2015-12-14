package storage

import (
	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/parser"
	"github.com/get3w/get3w/pkg/stringutils"
)

// Build all pages in the app.
func (site *Site) Build(copy bool) error {
	pages := site.GetPages()
	sections := site.GetSections()

	if copy {
		destinationPrefix := site.GetDestinationPrefix()

		// err := site.DeleteFolder(destinationPrefix)
		// if err != nil {
		// 	return err
		// }
		err := site.NewFolder(destinationPrefix)
		if err != nil {
			return err
		}

		err = site.buildCopy(pages)
		if err != nil {
			return err
		}
	}

	err := site.buildPages(pages, sections)
	if err != nil {
		return err
	}

	err = site.buildPosts()
	if err != nil {
		return err
	}

	return nil
}

func (site *Site) getExcludeKeys(pages []*get3w.Page) []string {
	excludeKeys := []string{}
	for _, page := range pages {
		if page.Path != "" {
			excludeKeys = append(excludeKeys, site.GetSourceKey(page.Path))
		}
		if len(page.Children) > 0 {
			childKeys := site.getExcludeKeys(page.Children)
			for _, childKey := range childKeys {
				excludeKeys = append(excludeKeys, childKey)
			}
		}
	}
	return excludeKeys
}

func (site *Site) buildCopy(pages []*get3w.Page) error {
	excludeKeys := []string{
		site.GetSourceKey("_"),
	}
	for _, excludeKey := range site.Config.Exclude {
		excludeKeys = append(excludeKeys, site.GetSourceKey(excludeKey))
	}
	for _, excludeKey := range site.getExcludeKeys(pages) {
		excludeKeys = append(excludeKeys, excludeKey)
	}

	includeKeys := []string{}
	for _, includeKey := range site.Config.Include {
		includeKeys = append(includeKeys, site.GetSourceKey(includeKey))
	}

	files, err := site.GetAllFiles(site.GetSourcePrefix(""))
	if err != nil {
		return err
	}

	for _, file := range files {
		if file.IsDir {
			continue
		}
		sourceKey := site.GetSourceKey(file.Path)

		if stringutils.HasPrefixIgnoreCase(excludeKeys, sourceKey) {
			if !stringutils.HasPrefixIgnoreCase(includeKeys, sourceKey) {
				continue
			}
		}

		destinationKey := site.GetDestinationKey(file.Path)
		err := site.CopyToDestination(sourceKey, destinationKey)
		if err != nil {
			return err
		}
	}

	return nil
}

func (site *Site) buildPages(pages []*get3w.Page, sections map[string]*get3w.Section) error {
	for _, page := range pages {
		template, layout := site.getTemplate(page.Layout, site.Config.LayoutPage)
		paginators := site.getPagePaginators(page)
		for _, paginator := range paginators {
			parsedContent, err := parser.ParsePage(site.Path, template, site.Config, sections, page, paginator)
			if err != nil {
				site.LogError(layout, paginator.Path, err)
			}

			err = site.WriteDestination(site.GetDestinationKey(paginator.Path), []byte(parsedContent))
			if err != nil {
				site.LogError(layout, paginator.Path, err)
			}
		}

		if len(page.Children) > 0 {
			site.buildPages(page.Children, sections)
		}
	}
	return nil
}

func (site *Site) buildPosts() error {
	posts := site.GetPosts("")
	for _, post := range posts {
		site.Config.RelatedPosts = getRelatedPosts(posts, post)
		site.Config.All["related_posts"] = site.Config.RelatedPosts
		url := post.URL
		template, layout := site.getTemplate(post.Layout, site.Config.LayoutPost)
		parsedContent, err := parser.ParsePost(site.Path, template, site.Config, post)
		if err != nil {
			site.LogError(layout, url, err)
		}

		err = site.WriteDestination(site.GetDestinationKey(url), []byte(parsedContent))
		if err != nil {
			site.LogError(layout, url, err)
		}
	}
	return nil
}
