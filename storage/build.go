package storage

import (
	"github.com/get3w/get3w-sdk-go/get3w"
	"github.com/get3w/get3w/pkg/stringutils"
)

// Build all channels in the app.
func (site *Site) Build(copy bool) error {
	if copy {
		destinationPrefix := site.Storage.GetDestinationPrefix("")

		// err := site.DeleteFolder(destinationPrefix)
		// if err != nil {
		// 	return err
		// }
		err := site.Storage.NewFolder(destinationPrefix)
		if err != nil {
			return err
		}
	}

	for _, lang := range site.Langs {
		site.Current = lang
		if copy {
			err := site.buildCopy()
			if err != nil {
				return err
			}
		}

		err := site.buildChannels(lang.Channels, lang.Sections)
		if err != nil {
			return err
		}

		err = site.buildPosts()
		if err != nil {
			return err
		}
	}

	return nil
}

func (site *Site) getExcludeKeys(channels []*get3w.Channel) []string {
	excludeKeys := []string{}
	for _, channel := range channels {
		if channel.Path != "" {
			excludeKeys = append(excludeKeys, site.key(channel.Path))
		}
		if len(channel.Children) > 0 {
			childKeys := site.getExcludeKeys(channel.Children)
			for _, childKey := range childKeys {
				excludeKeys = append(excludeKeys, childKey)
			}
		}
	}
	return excludeKeys
}

func (site *Site) buildCopy() error {
	excludeKeys := []string{}
	for _, excludeKey := range site.Config.Exclude {
		excludeKeys = append(excludeKeys, site.key(excludeKey))
	}
	for _, excludeKey := range site.getExcludeKeys(site.Current.Channels) {
		excludeKeys = append(excludeKeys, excludeKey)
	}

	includeKeys := []string{}
	for _, includeKey := range site.Config.Include {
		includeKeys = append(includeKeys, site.key(includeKey))
	}

	files, err := site.Storage.GetAllFiles(site.prefix(""))
	if err != nil {
		return err
	}

	for _, file := range files {
		if file.IsDir || isUnderscorePrefix(file.Path) {
			continue
		}
		sourceKey := site.Storage.GetSourceKey(file.Path)

		if stringutils.HasPrefixIgnoreCase(excludeKeys, sourceKey) {
			if !stringutils.HasPrefixIgnoreCase(includeKeys, sourceKey) {
				continue
			}
		}

		destinationKey := site.Storage.GetDestinationKey(file.Path)
		err := site.Storage.CopyToDestination(sourceKey, destinationKey)
		if err != nil {
			return err
		}
	}

	return nil
}

func (site *Site) buildChannels(channels []*get3w.Channel, sections map[string]*get3w.Section) error {
	for _, channel := range channels {
		template, layout := site.getTemplate(channel.Layout, site.Config.LayoutChannel)
		paginators := site.getChannelPaginators(channel)
		for _, paginator := range paginators {
			parsedContent, err := site.ParseChannel(template, channel, paginator)
			if err != nil {
				site.LogError(layout, paginator.Path, err)
			}

			err = site.Storage.WriteDestination(site.Storage.GetDestinationKey(paginator.Path), []byte(parsedContent))
			if err != nil {
				site.LogError(layout, paginator.Path, err)
			}
		}

		if len(channel.Children) > 0 {
			site.buildChannels(channel.Children, sections)
		}
	}
	return nil
}

func (site *Site) buildPosts() error {
	posts := site.GetPosts("")
	for _, post := range posts {
		site.Current.RelatedPosts = getRelatedPosts(posts, post)
		site.Current.AllParameters["related_posts"] = site.Current.RelatedPosts
		url := post.URL
		template, layout := site.getTemplate(post.Layout, site.Config.LayoutPost)
		parsedContent, err := site.ParsePost(template, post)
		if err != nil {
			site.LogError(layout, url, err)
		}

		err = site.Storage.WriteDestination(site.Storage.GetDestinationKey(site.Current.Path, url), []byte(parsedContent))
		if err != nil {
			site.LogError(layout, url, err)
		}
	}
	return nil
}
