class RemotelinkGo < Formula
  desc "Controlled remote computer access for AI"
  homepage "https://remotearc.app"
  version "0.7.2"
  conflicts_with "remotelink", because: "both install remotelink"

  on_macos do
    on_arm do
      url "https://github.com/Remote-Arc/remote-arc/releases/download/remotelink-v0.7.2/remotelink-v0.7.2-darwin-arm64", using: :nounzip
      sha256 "d2750afc17a2326020a47971c607397138b8537255079c5bba88f528fedd2484"
    end
    on_intel do
      url "https://github.com/Remote-Arc/remote-arc/releases/download/remotelink-v0.7.2/remotelink-v0.7.2-darwin-amd64", using: :nounzip
      sha256 "b3c67e66f92360d58c0098b3d4c210a7f6064c86b953c5dd09001acf989d145a"
    end
  end
  on_linux do
    on_arm do
      url "https://github.com/Remote-Arc/remote-arc/releases/download/remotelink-v0.7.2/remotelink-v0.7.2-linux-arm64", using: :nounzip
      sha256 "f256dfdd1753f8cfbd694bba64ab535c3497707828366a39a023f63fec401554"
    end
    on_intel do
      url "https://github.com/Remote-Arc/remote-arc/releases/download/remotelink-v0.7.2/remotelink-v0.7.2-linux-amd64", using: :nounzip
      sha256 "44fcefc7675825b06e2e2549748c0b48e1736135f666599563a85d811a80e2a0"
    end
  end

  def install
    bin.install Dir["remotelink-v*"].first => "remotelink"
    chmod 0755, bin/"remotelink"
  end

  test do
    assert_equal "0.7.2", shell_output("#{bin}/remotelink --version").strip
  end
end
