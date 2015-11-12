package chrootarchive

import (
	"io"

	"github.com/get3w/get3w/pkg/archive"
	"github.com/get3w/get3w/pkg/longpath"
)

// chroot is not supported by Windows
func chroot(path string) error {
	return nil
}

func invokeUnpack(decompressedArchive io.ReadCloser,
	dest string,
	options *archive.TarOptions) error {
	// Windows is different to Linux here because Windows does not support
	// chroot. Hence there is no point sandboxing a chrooted process to
	// do the unpack. We call inline instead within the daemon process.
	return archive.Unpack(decompressedArchive, longpath.AddPrefix(dest), options)
}
